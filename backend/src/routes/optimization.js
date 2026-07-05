const express = require('express');
const { optimizeToCoils, optimizeToSheets } = require('../services/optimizationEngine');
const Machine = require('../models/Machine');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Settings = require('../models/Settings');
const { Coil, Sheet } = require('../models/Inventory');
const CuttingJob = require('../models/CuttingJob');
const { restoreJobStock } = require('../services/stockRestore');
const { applyFulfillmentChange } = require('../services/fulfillment');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.use(protect);

/**
 * POST /api/optimization/run
 * Body: { order_id, line_item_id, material_type: 'coil'|'sheet', top_n? }
 */
router.post('/run', async (req, res) => {
  try {
    const { order_id, line_item_id, top_n = 5 } = req.body;

    const order = await Order.findById(order_id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const lineItem = order.line_items.id(line_item_id);
    if (!lineItem) return res.status(404).json({ message: 'Line item not found' });

    const [allMachines, pendingOrders, allCustomers, settings] = await Promise.all([
      Machine.find({ status: 'active' }),
      Order.find({ status: { $in: ['pending', 'in_production'] }, _id: { $ne: order_id } }),
      Customer.find({ isActive: true }),
      Settings.findOne({ singleton_key: 'app_settings' }),
    ]);

    // Output type is decided by whether the line needs a length (sheet) or not (coil).
    const options = lineItem.length_mm
      ? await optimizeToSheets(lineItem, allMachines, pendingOrders, allCustomers, settings, top_n)
      : await optimizeToCoils(lineItem, allMachines, pendingOrders, allCustomers, settings, top_n);

    // Supervisors don't see party info: drop customer-based offcut suggestions.
    if (req.user.role !== 'owner') {
      for (const opt of options) {
        if (Array.isArray(opt.offcut_reuse)) {
          opt.offcut_reuse = opt.offcut_reuse.filter(o => o.type !== 'customer');
        }
      }
    }

    res.json({
      order_number: order.order_number,
      line_item: lineItem,
      output: lineItem.length_mm ? 'sheet' : 'coil',
      options,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/optimization/confirm
 * Confirm a cutting option — creates CuttingJob and deducts inventory.
 */
router.post('/confirm', async (req, res) => {
  try {
    const {
      order_id, line_item_id, machine_id,
      inventory_id, inventory_type,
      material_weight_kg, cut_pieces,
      num_cuts, wastage_kg, wastage_pct,
      scrap_kg, estimated_time_hrs,
      scheduled_date, notes,
      restock_leftover, leftover,
    } = req.body;

    const order = await Order.findById(order_id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Guard against double-planning: a line item may only have one active cutting job at a time,
    // so an accidental second confirm can't deduct inventory twice.
    const existingJob = await CuttingJob.findOne({ order: order_id, line_item_id, status: { $ne: 'cancelled' } });
    if (existingJob) {
      return res.status(400).json({ message: `This size already has an active cutting job (${existingJob.job_number}). Cancel it first to re-plan.` });
    }

    // Deduct from inventory
    const Model = inventory_type === 'coil' ? Coil : Sheet;
    const item = await Model.findById(inventory_id);
    if (!item) return res.status(404).json({ message: 'Inventory item not found' });
    if (item.remaining_weight_kg < material_weight_kg) {
      return res.status(400).json({ message: 'Insufficient remaining weight in inventory item' });
    }

    item.remaining_weight_kg = parseFloat((item.remaining_weight_kg - material_weight_kg).toFixed(3));
    item.movements.push({
      type: 'job_deduction',
      weight_kg: material_weight_kg,
      reference: order.order_number,
      notes: `Deducted for order ${order.order_number}`,
    });
    await item.save();

    // The good product this job yields for the order = the ordered qty for this size.
    const orderedLine = order.line_items.id(line_item_id);
    const outputKg = orderedLine ? orderedLine.qty_kg : 0;

    // Create cutting job
    const job = await CuttingJob.create({
      order: order_id,
      line_item_id,
      machine: machine_id,
      inventory_item_id: inventory_id,
      inventory_type,
      material_weight_used_kg: material_weight_kg,
      output_kg: outputKg,
      cut_pieces: cut_pieces || [],
      num_cuts: num_cuts || 2,
      wastage_kg: wastage_kg || 0,
      wastage_pct: wastage_pct || 0,
      scrap_kg: scrap_kg || 0,
      estimated_time_hrs,
      scheduled_date,
      notes,
      created_by: req.user._id,
    });

    // Restock the reusable leftover strip as a new (narrower) coil, if the user chose to.
    let restockedCoil = null;
    if (restock_leftover && leftover && leftover.weight_kg > 0 && inventory_type === 'coil') {
      const w = parseFloat(Number(leftover.weight_kg).toFixed(3));
      restockedCoil = await Coil.create({
        od_mm: item.od_mm,
        id_mm: item.id_mm,
        width_mm: leftover.width_mm,
        gauge_mm: leftover.gauge_mm ?? item.gauge_mm,
        hardness: leftover.hardness ?? item.hardness,
        grade: item.grade,
        rust_level: leftover.rust_level ?? item.rust_level,
        supplier: item.supplier,
        weight_kg: w,
        remaining_weight_kg: w,
        movements: [{ type: 'adjustment', weight_kg: w, reference: job.job_number, notes: `Leftover restocked from job ${job.job_number}` }],
        notes: `Leftover ${leftover.width_mm}mm strip from cutting job ${job.job_number}`,
      });
      // Remember the restocked coil so cancelling the order can reverse it (avoids double-counting the leftover).
      job.restocked_coil_id = restockedCoil._id;
      await job.save();
    }

    // Update order status
    if (order.status === 'pending') {
      order.status = 'in_production';
      await order.save();
    }

    await job.populate('machine', 'name type');
    const out = job.toObject();
    if (restockedCoil) out.restocked_coil = { _id: restockedCoil._id, width_mm: restockedCoil.width_mm, weight_kg: restockedCoil.weight_kg, gauge_mm: restockedCoil.gauge_mm };
    res.status(201).json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/optimization/jobs — list cutting jobs
 */
router.get('/jobs', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.order_id) filter.order = req.query.order_id;
    const jobs = await CuttingJob.find(filter)
      .populate('order', 'order_number')
      .populate('machine', 'name type')
      .sort('-createdAt');
    res.json(jobs);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/**
 * PATCH /api/optimization/jobs/:id/status
 */
router.patch('/jobs/:id/status', async (req, res) => {
  try {
    const { status, completed_date } = req.body;
    const update = { status };
    if (status === 'completed') update.completed_date = completed_date || new Date();

    const existing = await CuttingJob.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Job not found' });

    // Cancelling a job returns its consumed material to inventory (once).
    if (status === 'cancelled' && existing.status !== 'cancelled') {
      await restoreJobStock(existing, existing.job_number, `Returned to stock — cutting job ${existing.job_number} cancelled`);
    }
    await applyFulfillmentChange(existing, existing.status, status);

    const job = await CuttingJob.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('machine', 'name').populate('order', 'order_number');
    res.json(job);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
