const express = require('express');
const Supplier = require('../models/Supplier');
const { protect, ownerOnly } = require('../middleware/auth');
const router = express.Router();

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const suppliers = await Supplier.find({ isActive: true }).sort('name');
    res.json(suppliers);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const supplier = await Supplier.create(req.body);
    res.status(201).json(supplier);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!supplier) return res.status(404).json({ message: 'Not found' });
    res.json(supplier);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/:id', ownerOnly, async (req, res) => {
  try {
    await Supplier.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Supplier deactivated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
