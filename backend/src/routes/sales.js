const express = require('express');
const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Customer = require('../models/Customer');
const { Coil, Sheet } = require('../models/Inventory');
const { protect, ownerOnly } = require('../middleware/auth');
const router = express.Router();

// Sales are sales information — owners only (same as parties).
router.use(protect, ownerOnly);

const MODELS = { coil: Coil, sheet: Sheet };
const round3 = n => parseFloat(Number(n).toFixed(3));
const fail = (status, message) => Object.assign(new Error(message), { status });
const sizeLabel = it => (it.item_type === 'sheet'
  ? `${it.length_mm}×${it.width_mm}×${it.thickness_mm}mm sheet`
  : `${it.width_mm}×${it.gauge_mm}mm coil`);

// Stock is changed with an "only if remaining is still what I read" write, so two people selling
// the same coil at once can't both take the last kilos. Retried if someone else got in first; undoing
// a change retries much longer, because giving up there would leave stock wrongly deducted.
async function changeStock(Model, id, build, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, Math.random() * 40));
    const item = await Model.findById(id);
    if (!item) throw fail(400, 'A stock item in this sale no longer exists');
    const { update, error } = build(item);
    if (error) throw fail(400, error);
    const done = await Model.findOneAndUpdate({ _id: id, remaining_weight_kg: item.remaining_weight_kg }, update);
    if (done) return;
  }
  throw fail(409, 'Stock was changed by someone else while saving — please try again');
}
const UNDO_ATTEMPTS = 50;

const takeOut = (Model, id, kg, movement) => changeStock(Model, id, item => {
  if (kg > item.remaining_weight_kg + 0.001) return { error: `Only ${item.remaining_weight_kg.toFixed(2)} kg left of ${sizeLabel(item)}` };
  return { update: { $set: { remaining_weight_kg: round3(Math.max(0, item.remaining_weight_kg - kg)) }, $push: { movements: movement } } };
});

const putBack = (Model, id, kg, movement) => changeStock(Model, id, item => {
  const remaining = round3(item.remaining_weight_kg + kg);
  return { update: { $set: { remaining_weight_kg: remaining, weight_kg: Math.max(item.weight_kg, remaining) }, $push: { movements: movement } } };
}, UNDO_ATTEMPTS);

// Undo a takeOut that belongs to a sale that failed to complete: put the weight back and drop its movement.
const undoTakeOut = (Model, id, kg, saleId) => changeStock(Model, id, item => ({
  update: { $set: { remaining_weight_kg: round3(item.remaining_weight_kg + kg) }, $pull: { movements: { type: 'sale', reference: String(saleId) } } },
}), UNDO_ATTEMPTS);

// Sum the weights per stock item (a sale may list the same item on two lines).
function totalsPerItem(items) {
  const map = new Map();
  for (const it of items) {
    const key = `${it.item_type}:${it.item}`;
    const cur = map.get(key) || { item_type: it.item_type, id: it.item, kg: 0 };
    cur.kg = round3(cur.kg + it.weight_kg);
    map.set(key, cur);
  }
  return [...map.values()];
}

// Adds the sold sizes to the party's "Sizes Used" list so they show up in Search-by-Size later.
async function addSoldSizesToParty(customer, items, saleDate) {
  const same = (a, b) => (a == null || a === '' ? null : Number(a)) === (b == null || b === '' ? null : Number(b));
  const known = [...(customer.preferred_sizes || [])];
  const fresh = [];
  const when = new Date(saleDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  for (const it of items) {
    const exists = [...known, ...fresh].some(s => (s.item_type || 'coil') === it.item_type
      && same(s.width_mm, it.width_mm) && same(s.thickness_mm, it.thickness_mm)
      && (it.item_type === 'coil' || same(s.length_mm, it.length_mm)));
    if (exists) continue;
    fresh.push({
      item_type: it.item_type, width_mm: it.width_mm, thickness_mm: it.thickness_mm,
      ...(it.item_type === 'sheet' ? { length_mm: it.length_mm } : {}),
      notes: `From sale on ${when}`,
    });
  }
  if (fresh.length) await Customer.updateOne({ _id: customer._id }, { $push: { preferred_sizes: { $each: fresh } } });
}

// GET /api/sales?customer=&from=&to=&status=
router.get('/', async (req, res) => {
  try {
    const { customer, from, to, status } = req.query;
    const filter = {};
    if (customer) filter.customer = customer;
    if (status) filter.status = status;
    if (from || to) {
      filter.sale_date = {};
      if (from) filter.sale_date.$gte = new Date(from);
      if (to) filter.sale_date.$lte = new Date(new Date(to).getTime() + 24 * 3600 * 1000 - 1);
    }
    const sales = await Sale.find(filter).populate('customer', 'name phone').populate('created_by', 'username').sort('-sale_date -createdAt');
    res.json(sales);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id).populate('customer', 'name phone').populate('created_by cancelled_by', 'username');
    if (!sale) return res.status(404).json({ message: 'Not found' });
    res.json(sale);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/sales — record a sale and take the weight out of stock.
// body: { customer, sale_date, bill_no, vehicle_no, notes, items: [{ item_type, item, weight_kg, pieces? }] }
router.post('/', async (req, res) => {
  const done = []; // stock changes made so far, so they can be undone if something later fails
  const saleId = new mongoose.Types.ObjectId();
  try {
    const { customer: customerId, sale_date, bill_no, vehicle_no, notes, items: lines } = req.body;
    if (!Array.isArray(lines) || lines.length === 0) throw fail(400, 'Add at least one item to the sale');
    const customer = await Customer.findById(customerId);
    if (!customer || !customer.isActive) throw fail(400, 'Choose a party for this sale');

    // 1. Check everything before touching stock, and snapshot each line from the live stock item.
    const items = [];
    for (const [i, line] of lines.entries()) {
      const Model = MODELS[line.item_type];
      if (!Model) throw fail(400, `Item ${i + 1}: choose a coil or sheet`);
      const weight = round3(line.weight_kg);
      if (!(weight > 0)) throw fail(400, `Item ${i + 1}: enter a weight greater than 0`);
      const stock = await Model.findById(line.item);
      if (!stock || !stock.isActive) throw fail(400, `Item ${i + 1}: this stock item is no longer available`);
      const pieces = Number(line.pieces);
      items.push({
        item_type: line.item_type, item: stock._id,
        width_mm: stock.width_mm,
        thickness_mm: line.item_type === 'coil' ? stock.gauge_mm : stock.thickness_mm,
        length_mm: line.item_type === 'sheet' ? stock.length_mm : undefined,
        hardness: stock.hardness, grade: stock.grade, rust_level: stock.rust_level,
        weight_kg: weight,
        pieces: line.item_type === 'sheet' && pieces > 0 ? pieces : undefined,
      });
    }
    const totals = totalsPerItem(items);
    for (const t of totals) {
      const stock = await MODELS[t.item_type].findById(t.id);
      if (t.kg > stock.remaining_weight_kg + 0.001) throw fail(400, `Only ${stock.remaining_weight_kg.toFixed(2)} kg left of ${sizeLabel(stock)} — you entered ${t.kg} kg`);
    }

    // 2. Take the stock out, one movement per stock item, recorded in its history.
    const note = `Sold to ${customer.name}${bill_no ? ` (bill ${bill_no})` : ''}`;
    for (const t of totals) {
      await takeOut(MODELS[t.item_type], t.id, t.kg, { type: 'sale', weight_kg: t.kg, reference: String(saleId), notes: note, by: req.user._id });
      done.push(t);
    }

    // 3. Save the sale itself.
    const sale = await Sale.create({
      _id: saleId, customer: customer._id, sale_date: sale_date || Date.now(), bill_no, vehicle_no, notes,
      items, total_weight_kg: round3(items.reduce((s, it) => s + it.weight_kg, 0)), created_by: req.user._id,
    });

    // 4. Remember what this party buys. Not worth failing a completed sale over.
    try { await addSoldSizesToParty(customer, items, sale.sale_date); }
    catch (err) { console.error('Could not update party sizes after sale:', err.message); }

    await sale.populate('customer', 'name phone');
    res.status(201).json(sale);
  } catch (err) {
    for (const t of done) {
      try { await undoTakeOut(MODELS[t.item_type], t.id, t.kg, saleId); }
      catch (e) { console.error('Could not undo stock change after failed sale:', t, e.message); }
    }
    res.status(err.status || 400).json({ message: err.message });
  }
});

// PATCH /api/sales/:id/cancel — the sale didn't happen: put the weight back on the stock.
router.patch('/:id/cancel', async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id).populate('customer', 'name');
    if (!sale) return res.status(404).json({ message: 'Not found' });
    if (sale.status === 'cancelled') return res.status(400).json({ message: 'This sale is already cancelled' });

    // Mark it first, so a double-click can't put the stock back twice.
    const claimed = await Sale.findOneAndUpdate({ _id: sale._id, status: 'active' },
      { status: 'cancelled', cancelled_at: new Date(), cancelled_by: req.user._id });
    if (!claimed) return res.status(400).json({ message: 'This sale is already cancelled' });

    const note = `Sale cancelled${sale.bill_no ? ` (bill ${sale.bill_no})` : ''} — ${sale.customer?.name || 'party'}`;
    for (const t of totalsPerItem(sale.items)) {
      await putBack(MODELS[t.item_type], t.id, t.kg, { type: 'sale_return', weight_kg: t.kg, reference: String(sale._id), notes: note, by: req.user._id });
    }
    res.json(await Sale.findById(sale._id).populate('customer', 'name phone'));
  } catch (err) { res.status(err.status || 400).json({ message: err.message }); }
});

module.exports = router;
