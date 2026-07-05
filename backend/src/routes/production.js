const express = require('express');
const { generateDailyPlan } = require('../services/productionPlanner');
const CuttingJob = require('../models/CuttingJob');
const Order = require('../models/Order');
const { Coil, Sheet } = require('../models/Inventory');
const { restoreJobStock } = require('../services/stockRestore');
const { applyFulfillmentChange } = require('../services/fulfillment');
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

// POST /api/production/jobs — log a production run manually (after-the-fact record keeping).
// Everything is optional except that if an inventory item + weight are given, that weight is
// deducted so stock stays accurate. Can reference an order by number or id.
router.post('/jobs', async (req, res) => {
  try {
    const b = req.body;

    // Resolve the order (by explicit id or by order_number) if one was referenced.
    let order = null;
    if (b.order_id) order = await Order.findById(b.order_id);
    else if (b.order_number) order = await Order.findOne({ order_number: b.order_number });
    if ((b.order_id || b.order_number) && !order) return res.status(404).json({ message: 'Referenced order not found' });

    // Optionally deduct the material used from a specific inventory piece.
    let inventory_type;
    const usedKg = Number(b.material_weight_kg) || 0;
    if (b.inventory_id && usedKg > 0) {
      inventory_type = b.inventory_type === 'sheet' ? 'sheet' : 'coil';
      const Model = inventory_type === 'coil' ? Coil : Sheet;
      const item = await Model.findById(b.inventory_id);
      if (!item) return res.status(404).json({ message: 'Inventory item not found' });
      if (item.remaining_weight_kg < usedKg) return res.status(400).json({ message: 'Insufficient remaining weight in inventory item' });
      item.remaining_weight_kg = parseFloat((item.remaining_weight_kg - usedKg).toFixed(3));
      item.movements.push({ type: 'job_deduction', weight_kg: usedKg, reference: order?.order_number || 'manual', notes: `Manual production log${order ? ` for order ${order.order_number}` : ''}` });
      await item.save();
    }

    const status = ['planned', 'in_progress', 'completed'].includes(b.status) ? b.status : 'completed';
    const job = await CuttingJob.create({
      order: order?._id,
      line_item_id: b.line_item_id || undefined,
      machine: b.machine_id || undefined,
      inventory_item_id: b.inventory_id || undefined,
      inventory_type,
      material_weight_used_kg: usedKg,
      output_kg: Number(b.output_kg) || 0,
      num_cuts: b.num_cuts,
      wastage_kg: Number(b.wastage_kg) || 0,
      wastage_pct: Number(b.wastage_pct) || 0,
      scrap_kg: Number(b.scrap_kg) || 0,
      estimated_time_hrs: b.estimated_time_hrs != null ? Number(b.estimated_time_hrs) : undefined,
      actual_start: b.actual_start || undefined,
      actual_end: b.actual_end || undefined,
      scheduled_date: b.scheduled_date || undefined,
      completed_date: status === 'completed' ? (b.actual_end || new Date()) : undefined,
      notes: b.notes,
      manual_entry: true,
      status,
      created_by: req.user._id,
    });

    // Credit produced qty to the order line if this manual log is already completed.
    if (status === 'completed') await applyFulfillmentChange(job, 'planned', 'completed');

    await job.populate('machine', 'name type');
    await job.populate('order', 'order_number');
    res.status(201).json(job);
  } catch (err) { console.error(err); res.status(400).json({ message: err.message }); }
});

// PATCH /api/production/jobs/:id — update status, timing, and manual overrides.
router.patch('/jobs/:id', async (req, res) => {
  try {
    const allowed = ['status', 'completed_date', 'notes', 'scheduled_date',
      'actual_start', 'actual_end', 'estimated_time_hrs', 'wastage_kg', 'wastage_pct', 'scrap_kg', 'output_kg'];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    const existing = await CuttingJob.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Not found' });

    // Convenience so the Start/End buttons record real times without extra fields:
    if (update.status === 'in_progress' && !existing.actual_start && update.actual_start === undefined) update.actual_start = new Date();
    if (update.status === 'completed') {
      if (!existing.actual_end && update.actual_end === undefined) update.actual_end = new Date();
      if (!existing.completed_date && update.completed_date === undefined) update.completed_date = update.actual_end || new Date();
    }

    // Cancelling a job returns the material it consumed to inventory (once), matching order cancellation.
    if (update.status === 'cancelled' && existing.status !== 'cancelled') {
      await restoreJobStock(existing, existing.job_number, `Returned to stock — cutting job ${existing.job_number} cancelled`);
    }
    // Keep the order line's produced-so-far in step when completion state changes.
    if (update.status && update.status !== existing.status) {
      await applyFulfillmentChange(existing, existing.status, update.status);
    }

    const job = await CuttingJob.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('machine', 'name').populate('order', 'order_number');
    res.json(job);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
