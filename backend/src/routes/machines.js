const express = require('express');
const Machine = require('../models/Machine');
const { protect, ownerOnly } = require('../middleware/auth');
const router = express.Router();

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.active === 'true') filter.status = 'active';
    const machines = await Machine.find(filter).sort('name');
    res.json(machines);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const machine = await Machine.findById(req.params.id);
    if (!machine) return res.status(404).json({ message: 'Not found' });
    res.json(machine);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', ownerOnly, async (req, res) => {
  try {
    const machine = await Machine.create(req.body);
    res.status(201).json(machine);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.put('/:id', ownerOnly, async (req, res) => {
  try {
    const machine = await Machine.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!machine) return res.status(404).json({ message: 'Not found' });
    res.json(machine);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.patch('/:id/toggle', ownerOnly, async (req, res) => {
  try {
    const machine = await Machine.findById(req.params.id);
    if (!machine) return res.status(404).json({ message: 'Not found' });
    machine.status = machine.status === 'active' ? 'inactive' : 'active';
    await machine.save();
    res.json(machine);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
