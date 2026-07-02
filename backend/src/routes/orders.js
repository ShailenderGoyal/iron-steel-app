const express = require('express');
const Order = require('../models/Order');
const { protect, ownerOnly } = require('../middleware/auth');
const router = express.Router();

router.use(protect);

// GET / — list orders. Supervisors see production data (specs, qty, status) but NOT
// the party (customer) identity, which is sales information.
router.get('/', async (req, res) => {
  try {
    const isOwner = req.user.role === 'owner';
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.customer && isOwner) filter.customer = req.query.customer;
    let q = Order.find(filter).sort({ priority: -1, deadline: 1, date_created: -1 });
    if (isOwner) q = q.populate('customer', 'name phone');
    let orders = await q.lean();
    if (!isOwner) orders = orders.map(o => { delete o.customer; return o; });
    res.json(orders);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const isOwner = req.user.role === 'owner';
    let q = Order.findById(req.params.id);
    if (isOwner) q = q.populate('customer', 'name phone address');
    const order = await q.lean();
    if (!order) return res.status(404).json({ message: 'Not found' });
    if (!isOwner) delete order.customer;
    res.json(order);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Creating / editing / deleting a sales order requires choosing a party, so it is owner-only.
router.post('/', ownerOnly, async (req, res) => {
  try {
    const order = await Order.create({ ...req.body, created_by: req.user._id });
    await order.populate('customer', 'name phone');
    res.status(201).json(order);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.put('/:id', ownerOnly, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('customer', 'name phone');
    if (!order) return res.status(404).json({ message: 'Not found' });
    res.json(order);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// Production status updates are allowed for both roles; response is redacted for supervisors.
router.patch('/:id/status', async (req, res) => {
  try {
    const isOwner = req.user.role === 'owner';
    const { status } = req.body;
    let q = Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (isOwner) q = q.populate('customer', 'name');
    const order = await q.lean();
    if (!order) return res.status(404).json({ message: 'Not found' });
    if (!isOwner) delete order.customer;
    res.json(order);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// POST /:id/shipments — record a dispatch (one shipment, one or more line items). Owner only.
router.post('/:id/shipments', ownerOnly, async (req, res) => {
  try {
    const { items, vehicle, notes } = req.body; // items: [{ line_item_id, qty_kg }]
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: 'No items to dispatch' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const shipItems = [];
    for (const it of items) {
      const qty = Number(it.qty_kg);
      if (!(qty > 0)) continue;
      const li = order.line_items.id(it.line_item_id);
      if (!li) return res.status(400).json({ message: 'Line item not found' });
      const remaining = li.qty_kg - (li.dispatched_kg || 0);
      if (qty > remaining + 0.001) {
        return res.status(400).json({ message: `Dispatch exceeds remaining (max ${remaining.toFixed(2)} kg for one item)` });
      }
      li.dispatched_kg = parseFloat(((li.dispatched_kg || 0) + qty).toFixed(3));
      shipItems.push({ line_item_id: li._id, qty_kg: parseFloat(qty.toFixed(3)) });
    }
    if (shipItems.length === 0) return res.status(400).json({ message: 'Nothing to dispatch' });

    order.shipments.push({ vehicle, notes, dispatched_by: req.user._id, items: shipItems });

    // Auto status: dispatched if everything is out, else partially_dispatched.
    const allOut = order.line_items.every(li => (li.dispatched_kg || 0) >= li.qty_kg - 0.001);
    order.status = allOut ? 'dispatched' : 'partially_dispatched';

    await order.save();
    await order.populate('customer', 'name phone');
    res.status(201).json(order);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/:id', ownerOnly, async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: 'Order deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
