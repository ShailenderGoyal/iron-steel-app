const express = require('express');
const { Coil, Sheet } = require('../models/Inventory');
const Settings = require('../models/Settings');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.use(protect);

// Weight calculation helpers
function calcCoilWeight({ od_mm, id_mm, width_mm }) {
  return (Math.PI / 4) * (od_mm ** 2 - id_mm ** 2) * width_mm * 0.00786 / 1000;
}

function calcSheetWeight({ length_mm, width_mm, thickness_mm }) {
  return (length_mm * width_mm * thickness_mm * 7.86) / 1e6;
}

// GET /api/inventory — list all (coils + sheets combined)
router.get('/', async (req, res) => {
  try {
    const { type, gauge_min, gauge_max, hardness, supplier, rust_level } = req.query;
    const baseFilter = { isActive: true };
    if (hardness) baseFilter.hardness = hardness;
    if (supplier) baseFilter.supplier = supplier;
    if (rust_level) baseFilter.rust_level = rust_level;

    // Supervisors don't see pricing (sales/cost info).
    const priceSelect = req.user.role === 'owner' ? null : '-purchase_price_per_kg';

    let coils = [], sheets = [];

    if (!type || type === 'coil') {
      const coilFilter = { ...baseFilter };
      if (gauge_min) coilFilter.gauge_mm = { $gte: Number(gauge_min) };
      if (gauge_max) coilFilter.gauge_mm = { ...coilFilter.gauge_mm, $lte: Number(gauge_max) };
      let cq = Coil.find(coilFilter).populate('supplier', 'name').sort('-createdAt');
      if (priceSelect) cq = cq.select(priceSelect);
      coils = await cq;
    }

    if (!type || type === 'sheet') {
      const sheetFilter = { ...baseFilter };
      if (gauge_min) sheetFilter.thickness_mm = { $gte: Number(gauge_min) };
      if (gauge_max) sheetFilter.thickness_mm = { ...sheetFilter.thickness_mm, $lte: Number(gauge_max) };
      let sq = Sheet.find(sheetFilter).populate('supplier', 'name').sort('-createdAt');
      if (priceSelect) sq = sq.select(priceSelect);
      sheets = await sq;
    }

    res.json({ coils, sheets });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/inventory/coils
router.post('/coils', async (req, res) => {
  try {
    const data = req.body;
    const computed = parseFloat(calcCoilWeight(data).toFixed(3));
    // Use a manual weight if one was entered, else the theoretical weight.
    data.weight_kg = (data.weight_kg && Number(data.weight_kg) > 0) ? parseFloat(Number(data.weight_kg).toFixed(3)) : computed;
    if (data.remaining_weight_kg === undefined) data.remaining_weight_kg = data.weight_kg;
    data.movements = [{ type: 'purchase', weight_kg: data.weight_kg, notes: 'Initial purchase' }];
    const coil = await Coil.create(data);
    await coil.populate('supplier', 'name');
    res.status(201).json(coil);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// POST /api/inventory/sheets
router.post('/sheets', async (req, res) => {
  try {
    const data = req.body;
    const qty = data.quantity || 1;
    const computedPer = parseFloat(calcSheetWeight(data).toFixed(3));
    if (data.weight_kg && Number(data.weight_kg) > 0) {
      // manual override on the total weight; derive per-sheet
      data.weight_kg = parseFloat(Number(data.weight_kg).toFixed(3));
      data.weight_per_sheet_kg = parseFloat((data.weight_kg / qty).toFixed(3));
    } else {
      data.weight_per_sheet_kg = computedPer;
      data.weight_kg = parseFloat((computedPer * qty).toFixed(3));
    }
    if (data.remaining_weight_kg === undefined) data.remaining_weight_kg = data.weight_kg;
    data.movements = [{ type: 'purchase', weight_kg: data.weight_kg, notes: 'Initial purchase' }];
    const sheet = await Sheet.create(data);
    await sheet.populate('supplier', 'name');
    res.status(201).json(sheet);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// GET /api/inventory/coils/:id
router.get('/coils/:id', async (req, res) => {
  try {
    const coil = await Coil.findById(req.params.id).populate('supplier', 'name');
    if (!coil) return res.status(404).json({ message: 'Not found' });
    res.json(coil);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/inventory/sheets/:id
router.get('/sheets/:id', async (req, res) => {
  try {
    const sheet = await Sheet.findById(req.params.id).populate('supplier', 'name');
    if (!sheet) return res.status(404).json({ message: 'Not found' });
    res.json(sheet);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/inventory/coils/:id
router.put('/coils/:id', async (req, res) => {
  try {
    const before = await Coil.findById(req.params.id).select('weight_kg remaining_weight_kg');
    if (!before) return res.status(404).json({ message: 'Not found' });
    const coil = await Coil.findByIdAndUpdate(req.params.id, req.body, { new: true });
    const computed = parseFloat(calcCoilWeight(coil).toFixed(3));
    const newTotal = (req.body.weight_kg && Number(req.body.weight_kg) > 0) ? parseFloat(Number(req.body.weight_kg).toFixed(3)) : computed;
    const used = Math.max(0, before.weight_kg - before.remaining_weight_kg);
    coil.weight_kg = newTotal;
    coil.remaining_weight_kg = parseFloat(Math.max(0, newTotal - used).toFixed(3));
    await coil.save();
    await coil.populate('supplier', 'name');
    res.json(coil);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// PUT /api/inventory/sheets/:id
router.put('/sheets/:id', async (req, res) => {
  try {
    const before = await Sheet.findById(req.params.id).select('weight_kg remaining_weight_kg');
    if (!before) return res.status(404).json({ message: 'Not found' });
    const sheet = await Sheet.findByIdAndUpdate(req.params.id, req.body, { new: true });
    const qty = sheet.quantity || 1;
    const computedPer = parseFloat(calcSheetWeight(sheet).toFixed(3));
    let newTotal, newPer;
    if (req.body.weight_kg && Number(req.body.weight_kg) > 0) {
      newTotal = parseFloat(Number(req.body.weight_kg).toFixed(3));
      newPer = parseFloat((newTotal / qty).toFixed(3));
    } else {
      newPer = computedPer;
      newTotal = parseFloat((computedPer * qty).toFixed(3));
    }
    const used = Math.max(0, before.weight_kg - before.remaining_weight_kg);
    sheet.weight_per_sheet_kg = newPer;
    sheet.weight_kg = newTotal;
    sheet.remaining_weight_kg = parseFloat(Math.max(0, newTotal - used).toFixed(3));
    await sheet.save();
    await sheet.populate('supplier', 'name');
    res.json(sheet);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// DELETE (deactivate)
router.delete('/coils/:id', async (req, res) => {
  try {
    await Coil.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Coil removed from inventory' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/sheets/:id', async (req, res) => {
  try {
    await Sheet.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Sheet removed from inventory' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/inventory/summary — dashboard stats

router.get('/summary/stats', async (req, res) => {
  try {
    const [coils, sheets, settings] = await Promise.all([
      Coil.find({ isActive: true }).populate('supplier', 'name'),
      Sheet.find({ isActive: true }).populate('supplier', 'name'),
      Settings.findOne({ singleton_key: 'app_settings' }),
    ]);
    const coilWeight = coils.reduce((s, c) => s + c.remaining_weight_kg, 0);
    const sheetWeight = sheets.reduce((s, sh) => s + sh.remaining_weight_kg, 0);

    // Low-stock: items at or below the configured % of their original weight remaining.
    const threshold = settings?.low_stock_threshold_pct ?? 20;
    const asItem = (it, kind, label) => ({
      _id: it._id, kind, label,
      remaining_kg: parseFloat((it.remaining_weight_kg || 0).toFixed(1)),
      remaining_pct: it.weight_kg ? Math.round((it.remaining_weight_kg / it.weight_kg) * 100) : 0,
      supplier: it.supplier?.name || '',
    });
    const low_stock = [
      ...coils.map(c => asItem(c, 'coil', `${c.width_mm}×${c.gauge_mm}mm coil`)),
      ...sheets.map(s => asItem(s, 'sheet', `${s.length_mm}×${s.width_mm}×${s.thickness_mm}mm sheet`)),
    ].filter(x => x.remaining_pct <= threshold).sort((a, b) => a.remaining_pct - b.remaining_pct);

    res.json({
      coil_count: coils.length,
      sheet_count: sheets.length,
      total_coil_kg: parseFloat(coilWeight.toFixed(2)),
      total_sheet_kg: parseFloat(sheetWeight.toFixed(2)),
      total_stock_kg: parseFloat((coilWeight + sheetWeight).toFixed(2)),
      low_stock_threshold_pct: threshold,
      low_stock,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
