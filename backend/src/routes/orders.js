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

router.delete('/:id', ownerOnly, async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: 'Order deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
