const express = require('express');
const { Coil, Sheet } = require('../models/Inventory');
const Order = require('../models/Order');
const CuttingJob = require('../models/CuttingJob');
const Machine = require('../models/Machine');
const { protect, ownerOnly } = require('../middleware/auth');
const router = express.Router();

// Stats aggregate supplier + order data — owners only.
router.use(protect, ownerOnly);

const monthKey = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
};

router.get('/', async (req, res) => {
  try {
    const [coils, sheets, orders, jobs] = await Promise.all([
      Coil.find({ isActive: true }).populate('supplier', 'name').lean(),
      Sheet.find({ isActive: true }).populate('supplier', 'name').lean(),
      Order.find({}).lean(),
      CuttingJob.find({}).populate('machine', 'name').lean(),
    ]);

    const now = Date.now();
    const inv = [
      ...coils.map(c => ({ ...c, kind: 'coil', label: `${c.width_mm}×${c.gauge_mm}mm coil` })),
      ...sheets.map(s => ({ ...s, kind: 'sheet', label: `${s.length_mm}×${s.width_mm}×${s.thickness_mm}mm sheet` })),
    ];

    // ---- Inventory summary + aging ----
    const totalCoilKg = coils.reduce((a, c) => a + (c.remaining_weight_kg || 0), 0);
    const totalSheetKg = sheets.reduce((a, s) => a + (s.remaining_weight_kg || 0), 0);
    const withAge = inv.map(it => {
      const start = new Date(it.purchase_date || it.createdAt).getTime();
      const age_days = Math.max(0, Math.round((now - start) / 86400000));
      const remaining_pct = it.weight_kg ? Math.round((it.remaining_weight_kg / it.weight_kg) * 100) : 0;
      return { kind: it.kind, label: it.label, supplier: it.supplier?.name || '—', age_days, remaining_kg: +(it.remaining_weight_kg || 0).toFixed(1), remaining_pct };
    });
    const avg_age_days = withAge.length ? Math.round(withAge.reduce((a, x) => a + x.age_days, 0) / withAge.length) : 0;
    const oldest = [...withAge].sort((a, b) => b.age_days - a.age_days).slice(0, 8);
    const low_stock = withAge.filter(x => x.remaining_pct < 20).sort((a, b) => a.remaining_pct - b.remaining_pct).slice(0, 8);

    // ---- Orders ----
    const orderStatus = {};
    orders.forEach(o => { orderStatus[o.status] = (orderStatus[o.status] || 0) + 1; });

    // ---- Jobs / wastage ----
    const totalWastageKg = jobs.reduce((a, j) => a + (j.wastage_kg || 0), 0);
    const totalScrapKg = jobs.reduce((a, j) => a + (j.scrap_kg || 0), 0);
    const totalMaterialKg = jobs.reduce((a, j) => a + (j.material_weight_used_kg || 0), 0);
    const avgWastagePct = jobs.length ? jobs.reduce((a, j) => a + (j.wastage_pct || 0), 0) / jobs.length : 0;

    // ---- Over time (monthly) ----
    const monthMap = {};
    jobs.forEach(j => {
      const k = monthKey(j.createdAt);
      if (!monthMap[k]) monthMap[k] = { month: k, wastage_kg: 0, material_kg: 0, jobs: 0 };
      monthMap[k].wastage_kg += j.wastage_kg || 0;
      monthMap[k].material_kg += j.material_weight_used_kg || 0;
      monthMap[k].jobs += 1;
    });
    const over_time = Object.values(monthMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({
        month: m.month,
        wastage_kg: +m.wastage_kg.toFixed(1),
        jobs: m.jobs,
        efficiency_pct: m.material_kg ? +(100 - (m.wastage_kg / m.material_kg) * 100).toFixed(1) : null,
      }));

    // ---- Machine utilization (total estimated hours) ----
    const machHours = {};
    jobs.forEach(j => {
      const name = j.machine?.name || 'Unassigned';
      machHours[name] = (machHours[name] || 0) + (j.estimated_time_hrs || 0);
    });
    const machine_util = Object.entries(machHours)
      .map(([machine, hrs]) => ({ machine, hours: +hrs.toFixed(1) }))
      .sort((a, b) => b.hours - a.hours);

    // ---- Inventory by supplier ----
    const supMap = {};
    inv.forEach(it => {
      const name = it.supplier?.name || 'Unknown';
      if (!supMap[name]) supMap[name] = { supplier: name, items: 0, kg: 0 };
      supMap[name].items += 1;
      supMap[name].kg += it.remaining_weight_kg || 0;
    });
    const by_supplier = Object.values(supMap).map(s => ({ ...s, kg: +s.kg.toFixed(1) })).sort((a, b) => b.kg - a.kg);

    res.json({
      inventory: {
        coil_count: coils.length,
        sheet_count: sheets.length,
        total_coil_kg: +totalCoilKg.toFixed(1),
        total_sheet_kg: +totalSheetKg.toFixed(1),
        avg_age_days,
        oldest,
        low_stock,
      },
      orders: { by_status: orderStatus, total: orders.length },
      jobs: {
        total: jobs.length,
        completed: jobs.filter(j => j.status === 'completed').length,
        total_material_kg: +totalMaterialKg.toFixed(1),
        total_wastage_kg: +totalWastageKg.toFixed(1),
        total_scrap_kg: +totalScrapKg.toFixed(1),
        avg_wastage_pct: +avgWastagePct.toFixed(1),
      },
      over_time,
      machine_util,
      by_supplier,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
