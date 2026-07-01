const express = require('express');
const { Coil, Sheet } = require('../models/Inventory');
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
    const { type, gauge_min, gauge_max, hardness, supplier } = req.query;
    const baseFilter = { isActive: true };
    if (hardness) baseFilter.hardness = hardness;
    if (supplier) baseFilter.supplier = supplier;

    let coils = [], sheets = [];

    if (!type || type === 'coil') {
      const coilFilter = { ...baseFilter };
      if (gauge_min) coilFilter.gauge_mm = { $gte: Number(gauge_min) };
      if (gauge_max) coilFilter.gauge_mm = { ...coilFilter.gauge_mm, $lte: Number(gauge_max) };
      coils = await Coil.find(coilFilter).populate('supplier', 'name').sort('-createdAt');
    }

    if (!type || type === 'sheet') {
      const sheetFilter = { ...baseFilter };
      if (gauge_min) sheetFilter.thickness_mm = { $gte: Number(gauge_min) };
      if (gauge_max) sheetFilter.thickness_mm = { ...sheetFilter.thickness_mm, $lte: Number(gauge_max) };
      sheets = await Sheet.find(sheetFilter).populate('supplier', 'name').sort('-createdAt');
    }

    res.json({ coils, sheets });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/inventory/coils
router.post('/coils', async (req, res) => {
  try {
    const data = req.body;
    const weight = calcCoilWeight(data);
    data.weight_kg = parseFloat(weight.toFixed(3));
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
    const wpSheet = calcSheetWeight(data);
    data.weight_per_sheet_kg = parseFloat(wpSheet.toFixed(3));
    data.weight_kg = parseFloat((wpSheet * (data.quantity || 1)).toFixed(3));
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
    const coil = await Coil.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('supplier', 'name');
    if (!coil) return res.status(404).json({ message: 'Not found' });
    res.json(coil);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// PUT /api/inventory/sheets/:id
router.put('/sheets/:id', async (req, res) => {
  try {
    const sheet = await Sheet.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('supplier', 'name');
    if (!sheet) return res.status(404).json({ message: 'Not found' });
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
    const coils = await Coil.find({ isActive: true });
    const sheets = await Sheet.find({ isActive: true });
    const coilWeight = coils.reduce((s, c) => s + c.remaining_weight_kg, 0);
    const sheetWeight = sheets.reduce((s, sh) => s + sh.remaining_weight_kg, 0);
    res.json({
      coil_count: coils.length,
      sheet_count: sheets.length,
      total_coil_kg: parseFloat(coilWeight.toFixed(2)),
      total_sheet_kg: parseFloat(sheetWeight.toFixed(2)),
      total_stock_kg: parseFloat((coilWeight + sheetWeight).toFixed(2)),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
