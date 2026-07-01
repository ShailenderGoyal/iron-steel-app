const express = require('express');
const { optimizeCoilCutting, optimizeSheetCutting } = require('../services/optimizationEngine');
const Machine = require('../models/Machine');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const { Coil, Sheet } = require('../models/Inventory');
const CuttingJob = require('../models/CuttingJob');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.use(protect);

/**
 * POST /api/optimization/run
 * Body: { order_id, line_item_id, material_type: 'coil'|'sheet', top_n? }
 */
router.post('/run', async (req, res) => {
  try {
    const { order_id, line_item_id, material_type = 'coil', top_n = 5 } = req.body;

    const order = await Order.findById(order_id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const lineItem = order.line_items.id(line_item_id);
    if (!lineItem) return res.status(404).json({ message: 'Line item not found' });

    const [allMachines, pendingOrders, allCustomers] = await Promise.all([
      Machine.find({ status: 'active' }),
      Order.find({ status: { $in: ['pending', 'in_production'] }, _id: { $ne: order_id } }),
      Customer.find({ isActive: true }),
    ]);

    let options;
    if (material_type === 'coil') {
      options = await optimizeCoilCutting(lineItem, allMachines, pendingOrders, allCustomers, top_n);
    } else {
      options = await optimizeSheetCutting(lineItem, allMachines, top_n);
    }

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
    } = req.body;

    const order = await Order.findById(order_id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

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

    // Create cutting job
    const job = await CuttingJob.create({
      order: order_id,
      line_item_id,
      machine: machine_id,
      inventory_item_id: inventory_id,
      inventory_type,
      material_weight_used_kg: material_weight_kg,
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

    // Update order status
    if (order.status === 'pending') {
      order.status = 'in_production';
      await order.save();
    }

    await job.populate('machine', 'name type');
    res.status(201).json(job);
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
    const job = await CuttingJob.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('machine', 'name').populate('order', 'order_number');
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json(job);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
