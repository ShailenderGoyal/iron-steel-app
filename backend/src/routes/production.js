const express = require('express');
const { generateDailyPlan } = require('../services/productionPlanner');
const CuttingJob = require('../models/CuttingJob');
const { restoreJobStock } = require('../services/stockRestore');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.use(protect);

// GET /api/production/plan?date=YYYY-MM-DD
router.get('/plan', async (req, res) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const plan = await generateDailyPlan(date);
    // Supervisors don't see the party (customer) identity.
    if (req.user.role !== 'owner') {
      Object.values(plan.schedule || {}).forEach(m => (m.jobs || []).forEach(j => { delete j.customer; }));
    }
    res.json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/production/jobs — all cutting jobs for production view
router.get('/jobs', async (req, res) => {
  try {
    const filter = { status: { $in: ['planned', 'in_progress', 'completed'] } };
    if (req.query.machine) filter.machine = req.query.machine;
    if (req.query.status) filter.status = req.query.status;
    const jobs = await CuttingJob.find(filter)
      .populate({ path: 'order', select: 'order_number priority deadline', populate: { path: 'customer', select: 'name' } })
      .populate('machine', 'name type')
      .sort([['order.priority', -1], ['order.deadline', 1], ['createdAt', 1]]);
    // Supervisors don't see the party (customer) identity.
    if (req.user.role !== 'owner') {
      const stripped = jobs.map(j => { const o = j.toObject(); if (o.order) delete o.order.customer; return o; });
      return res.json(stripped);
    }
    res.json(jobs);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/production/jobs/:id — update status, log downtime, etc.
router.patch('/jobs/:id', async (req, res) => {
  try {
    const allowed = ['status', 'completed_date', 'notes', 'scheduled_date'];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    const existing = await CuttingJob.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Not found' });

    // Cancelling a job returns the material it consumed to inventory (once), matching order cancellation.
    if (update.status === 'cancelled' && existing.status !== 'cancelled') {
      await restoreJobStock(existing, existing.job_number, `Returned to stock — cutting job ${existing.job_number} cancelled`);
    }

    const job = await CuttingJob.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('machine', 'name').populate('order', 'order_number');
    res.json(job);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
