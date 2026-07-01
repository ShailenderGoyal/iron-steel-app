const express = require('express');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const customers = await Customer.find({ isActive: true }).sort('name');
    res.json(customers);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Not found' });
    res.json(customer);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id/orders', async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.params.id }).populate('customer', 'name').sort('-date_created');
    res.json(orders);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const customer = await Customer.create(req.body);
    res.status(201).json(customer);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!customer) return res.status(404).json({ message: 'Not found' });
    res.json(customer);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await Customer.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Customer deactivated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
