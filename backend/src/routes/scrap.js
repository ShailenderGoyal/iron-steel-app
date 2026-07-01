const express = require('express');
const CuttingJob = require('../models/CuttingJob');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const jobs = await CuttingJob.find({ scrap_kg: { $gt: 0 } })
      .populate('order', 'order_number')
      .populate('machine', 'name')
      .sort('-createdAt');

    const scrapItems = jobs.map(j => ({
      job_number: j.job_number,
      order_number: j.order?.order_number,
      machine: j.machine?.name,
      scrap_kg: j.scrap_kg,
      date: j.createdAt,
      status: j.status,
    }));

    const total_scrap_kg = jobs.reduce((s, j) => s + j.scrap_kg, 0);
    res.json({ scrap_items: scrapItems, total_scrap_kg });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/summary', async (req, res) => {
  try {
    const jobs = await CuttingJob.find({ status: 'completed' });
    const total_wastage_kg = jobs.reduce((s, j) => s + (j.wastage_kg || 0), 0);
    const total_scrap_kg = jobs.reduce((s, j) => s + (j.scrap_kg || 0), 0);
    res.json({
      total_wastage_kg: parseFloat(total_wastage_kg.toFixed(2)),
      total_scrap_kg: parseFloat(total_scrap_kg.toFixed(2)),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
