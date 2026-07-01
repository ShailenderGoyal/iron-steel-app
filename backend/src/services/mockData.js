/**
 * Mock Data Seed Script — Realistic demo data for Iron & Steel Management System
 *
 * Designed so that the Optimization Engine finds meaningful results:
 * - Coil widths chosen so order line items cut with <5% wastage
 * - Offcut reuse: some leftover widths match other pending orders / customer preferred sizes
 * - Mix of hardness grades across machines
 * - Some partially-consumed coils to show inventory depletion
 * - Completed cutting jobs to populate Production & Scrap views
 *
 * Run: node src/services/mockData.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const { Coil, Sheet } = require('../models/Inventory');
const Supplier = require('../models/Supplier');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const CuttingJob = require('../models/CuttingJob');
const Machine = require('../models/Machine');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/iron_steel_db';

// Same formulas as backend routes
function calcCoilWeight({ od_mm, id_mm, width_mm }) {
  return parseFloat(((Math.PI / 4) * (od_mm ** 2 - id_mm ** 2) * width_mm * 0.00786 / 1000).toFixed(1));
}
function calcSheetWeight({ length_mm, width_mm, thickness_mm }) {
  return parseFloat(((length_mm * width_mm * thickness_mm * 7.86) / 1e6).toFixed(2));
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // ─── Suppliers ────────────────────────────────────────────────────────────
  const [tata, jsw, sail] = await Supplier.insertMany([
    { name: 'Tata Steel Ltd', contact: 'Ramesh Sharma', phone: '9820012345', address: 'Jamshedpur, Jharkhand', notes: 'Primary coil supplier — soft & semi-soft grades' },
    { name: 'JSW Steel', contact: 'Vikram Patel', phone: '9321056789', address: 'Vijayanagar, Karnataka', notes: 'Medium & hard grades, competitive lead times' },
    { name: 'SAIL – Bokaro', contact: 'Suresh Kumar', phone: '9431098765', address: 'Bokaro Steel City, Jharkhand', notes: 'Sheets & heavy coils — medium_hard, hard grades' },
  ]);
  console.log('✓ Suppliers: 3 created');

  // ─── Customers (Parties) ──────────────────────────────────────────────────
  // preferred_sizes are used by the optimization engine to show offcut reuse suggestions
  const [rajesh, sharma, gupta, patel, kumar, mehta, singh, arora] = await Customer.insertMany([
    {
      name: 'Rajesh Auto Parts', contact: 'Rajesh Verma', phone: '9812345678', address: 'Faridabad, Haryana',
      notes: 'Narrow strips for auto body clips and brackets',
      preferred_sizes: [
        { width_mm: 47, thickness_mm: 0.80, hardness: 'soft', notes: 'Body clip strip' },
        { width_mm: 25, thickness_mm: 0.50, hardness: 'soft', notes: 'Edge trim' },
        { width_mm: 19, thickness_mm: 0.60, hardness: 'semi_soft', notes: 'Reinforcement band' },
      ],
    },
    {
      name: 'Sharma Sheet Metal Works', contact: 'Dinesh Sharma', phone: '9988776655', address: 'Gurgaon, Haryana',
      notes: 'Standard blanks for press shop',
      preferred_sizes: [
        { width_mm: 100, thickness_mm: 1.00, hardness: 'medium', notes: 'Press blank' },
        { width_mm: 75, thickness_mm: 1.00, hardness: 'medium', notes: 'Bracket blank' },
      ],
    },
    {
      name: 'Gupta Engineering Works', contact: 'Anil Gupta', phone: '9876543210', address: 'Ludhiana, Punjab',
      notes: 'Agricultural equipment parts — medium-hard grades',
      preferred_sizes: [
        { width_mm: 80, thickness_mm: 1.50, hardness: 'medium_hard', notes: 'Blade stock' },
        { width_mm: 120, thickness_mm: 1.20, hardness: 'semi_soft', notes: 'Cover panel' },
      ],
    },
    {
      name: 'Patel Fabricators Pvt Ltd', contact: 'Bhavesh Patel', phone: '9099887766', address: 'Rajkot, Gujarat',
      notes: 'Large structural sections — high volume',
      preferred_sizes: [
        { width_mm: 150, thickness_mm: 1.00, hardness: 'medium', notes: 'Channel blank' },
        { width_mm: 200, thickness_mm: 2.00, hardness: 'medium', notes: 'Structural blank' },
      ],
    },
    {
      name: 'Kumar Industries', contact: 'Sandeep Kumar', phone: '9765432100', address: 'Pune, Maharashtra',
      notes: 'Precision slit strips for electronics enclosures',
      preferred_sizes: [
        { width_mm: 50, thickness_mm: 1.20, hardness: 'semi_soft' },
        { width_mm: 65, thickness_mm: 0.40, hardness: 'semi_soft' },
      ],
    },
    {
      name: 'Mehta Auto Components', contact: 'Nikhil Mehta', phone: '9321987654', address: 'Chennai, Tamil Nadu',
      notes: 'High-priority automotive OEM supplier',
      preferred_sizes: [
        { width_mm: 85, thickness_mm: 0.80, hardness: 'soft', notes: 'Hood liner' },
        { width_mm: 46, thickness_mm: 0.80, hardness: 'soft', notes: 'Offcut size — contact if available' },
      ],
    },
    {
      name: 'Singh Steel Traders', contact: 'Harpreet Singh', phone: '9876001234', address: 'Amritsar, Punjab',
      notes: 'Reseller — buys standard slit coils for further distribution',
      preferred_sizes: [
        { width_mm: 53, thickness_mm: 0.80, hardness: 'hard', notes: 'Standard hard strip' },
      ],
    },
    {
      name: 'Arora Precision Parts', contact: 'Rohit Arora', phone: '9540123456', address: 'Noida, UP',
      notes: 'Tight tolerance precision stamping blanks',
      preferred_sizes: [
        { width_mm: 66, thickness_mm: 1.50, hardness: 'medium_hard' },
        { width_mm: 40, thickness_mm: 1.50, hardness: 'medium_hard' },
      ],
    },
  ]);
  console.log('✓ Customers: 8 created');

  // ─── Coils ────────────────────────────────────────────────────────────────
  // Dimensions designed so orders can be cut with minimal wastage.
  // Key offcut scenario: Coil C11 (300mm wide, 0.80mm, soft) cut for 127mm order
  //   → 2 pieces × 127 = 254mm used, leftover = 46mm ≈ Mehta's preferred 46mm ✓

  const coilDefs = [
    // C1: 520mm soft 0.80mm — cuts 11×47mm (Rajesh, 0% waste), or 4×130mm, or 2×260mm
    { od_mm: 1200, id_mm: 508, width_mm: 520, gauge_mm: 0.80, hardness: 'soft', grade: 'grade_1', supplier: tata._id, purchase_date: '2026-03-01', notes: 'Primary wide soft coil — Slitter 1' },
    // C2: 450mm medium 1.00mm — cuts 3×150mm (0% waste) or 6×75mm
    { od_mm: 1100, id_mm: 508, width_mm: 450, gauge_mm: 1.00, hardness: 'medium', grade: 'grade_1', supplier: jsw._id, purchase_date: '2026-03-05' },
    // C3: 300mm soft 0.60mm — cuts 3×100mm (0% waste) or 4×75mm
    { od_mm: 950, id_mm: 508, width_mm: 300, gauge_mm: 0.60, hardness: 'soft', grade: 'grade_1', supplier: tata._id, purchase_date: '2026-03-08' },
    // C4: 250mm semi_soft 1.20mm — cuts 2×125mm (0%), or 5×50mm
    { od_mm: 900, id_mm: 508, width_mm: 250, gauge_mm: 1.20, hardness: 'semi_soft', grade: 'grade_1', supplier: jsw._id, purchase_date: '2026-03-10' },
    // C5: 200mm medium_hard 1.50mm — cuts 2×100mm (0%) or 3×66mm+2mm leftover (1%)
    { od_mm: 850, id_mm: 508, width_mm: 200, gauge_mm: 1.50, hardness: 'medium_hard', grade: 'grade_1', supplier: sail._id, purchase_date: '2026-03-12' },
    // C6: 170mm soft 0.50mm — cuts 2×85mm (0%) or 6×25mm+20mm leftover (11.8%)
    { od_mm: 800, id_mm: 508, width_mm: 170, gauge_mm: 0.50, hardness: 'soft', grade: 'grade_1', supplier: tata._id, purchase_date: '2026-03-12' },
    // C7: 160mm hard 0.80mm — cuts 2×80mm (0%) or 3×53mm+1mm (0.6%) → Singh preferred 53mm ✓
    { od_mm: 750, id_mm: 508, width_mm: 160, gauge_mm: 0.80, hardness: 'hard', grade: 'grade_2', supplier: sail._id, purchase_date: '2026-03-15' },
    // C8: 400mm medium 2.00mm — cuts 2×200mm (0%) — Slitter 1 + CTL only
    { od_mm: 1300, id_mm: 508, width_mm: 400, gauge_mm: 2.00, hardness: 'medium', grade: 'grade_1', supplier: jsw._id, purchase_date: '2026-03-15' },
    // C9: 130mm semi_soft 0.40mm — cuts 2×65mm (0%) — very thin, Slitter 2
    { od_mm: 700, id_mm: 508, width_mm: 130, gauge_mm: 0.40, hardness: 'semi_soft', grade: 'grade_1', supplier: tata._id, purchase_date: '2026-03-18' },
    // C10: 400mm hard 1.20mm — cuts 5×80mm (0%) — available on all slitters
    { od_mm: 1000, id_mm: 508, width_mm: 400, gauge_mm: 1.20, hardness: 'hard', grade: 'grade_2', supplier: sail._id, purchase_date: '2026-03-20' },
    // C11: 300mm soft 0.80mm — OFFCUT SCENARIO: 2×127=254mm, leftover 46mm ≈ Mehta pref ✓
    { od_mm: 950, id_mm: 508, width_mm: 300, gauge_mm: 0.80, hardness: 'soft', grade: 'grade_1', supplier: tata._id, purchase_date: '2026-03-22', notes: 'Leftover 46mm → check Mehta Auto Components' },
    // C12: 520mm medium 1.50mm — partially used — cuts 3×173mm+1mm (<0.2%)
    { od_mm: 1250, id_mm: 508, width_mm: 520, gauge_mm: 1.50, hardness: 'medium', grade: 'grade_1', supplier: jsw._id, purchase_date: '2026-02-20', notes: 'Partially used — remainder from ORD-0001' },
    // C13: 200mm medium_hard 1.50mm — cuts 3×66mm+2mm (1%) or 5×40mm (0%) → Arora pref ✓
    { od_mm: 800, id_mm: 508, width_mm: 200, gauge_mm: 1.50, hardness: 'medium_hard', grade: 'grade_1', supplier: sail._id, purchase_date: '2026-03-25' },
  ];

  const coilsToInsert = coilDefs.map(c => {
    const wt = calcCoilWeight(c);
    return {
      ...c,
      weight_kg: wt,
      remaining_weight_kg: c.notes?.includes('Partially used') ? parseFloat((wt * 0.58).toFixed(1)) : wt,
      movements: [{ type: 'purchase', weight_kg: wt, notes: 'Initial purchase' }],
      isActive: true,
    };
  });
  const createdCoils = await Coil.insertMany(coilsToInsert);
  console.log(`✓ Coils: ${createdCoils.length} created`);

  // ─── Sheets ───────────────────────────────────────────────────────────────
  const sheetDefs = [
    { length_mm: 2500, width_mm: 1250, thickness_mm: 1.60, hardness: 'soft', grade: 'grade_1', format_preset: '2500x1250', quantity: 50, supplier: tata._id, purchase_date: '2026-03-10' },
    { length_mm: 2000, width_mm: 1000, thickness_mm: 2.00, hardness: 'medium', grade: 'grade_1', format_preset: '2000x1000', quantity: 30, supplier: jsw._id, purchase_date: '2026-03-12' },
    { length_mm: 1500, width_mm: 750, thickness_mm: 1.00, hardness: 'semi_soft', grade: 'grade_1', format_preset: '1500x750', quantity: 80, supplier: tata._id, purchase_date: '2026-03-18' },
    { length_mm: 2500, width_mm: 1250, thickness_mm: 2.50, hardness: 'medium_hard', grade: 'grade_2', format_preset: '2500x1250', quantity: 25, supplier: sail._id, purchase_date: '2026-03-20' },
    { length_mm: 3000, width_mm: 1500, thickness_mm: 3.00, hardness: 'medium', grade: 'grade_1', format_preset: 'custom', quantity: 15, supplier: jsw._id, purchase_date: '2026-03-22', notes: 'Heavy plate for structural' },
  ];

  const sheetsToInsert = sheetDefs.map(s => {
    const wps = calcSheetWeight(s);
    const wt = parseFloat((wps * s.quantity).toFixed(2));
    return {
      ...s,
      weight_per_sheet_kg: wps,
      weight_kg: wt,
      remaining_weight_kg: wt,
      movements: [{ type: 'purchase', weight_kg: wt, notes: 'Initial purchase' }],
      isActive: true,
    };
  });
  const createdSheets = await Sheet.insertMany(sheetsToInsert);
  console.log(`✓ Sheets: ${createdSheets.length} created`);

  // ─── Orders ───────────────────────────────────────────────────────────────
  // Line items designed to match available coils above
  const today = new Date('2026-04-11');
  const d = (daysOffset) => new Date(today.getTime() + daysOffset * 86400000);

  const orderDefs = [
    // ORD-0001 — Rajesh Auto Parts — high priority — 47mm×0.80mm strips from C1 (520mm → 11×47=517mm, 0.6% waste)
    {
      customer: rajesh._id, priority: 'high', deadline: d(5),
      status: 'pending',
      notes: 'Urgent — auto plant line stoppage risk',
      line_items: [
        { width_mm: 47, thickness_mm: 0.80, hardness: 'soft', qty_kg: 800, qty_tolerance_pct: 10, width_tolerance_mm: 0.2, gauge_tolerance_mm: 0.1 },
        { width_mm: 25, thickness_mm: 0.50, hardness: 'soft', qty_kg: 300, qty_tolerance_pct: 15, width_tolerance_mm: 0.2, gauge_tolerance_mm: 0.1 },
      ],
    },
    // ORD-0002 — Sharma Sheet Metal — 100mm×1.00mm (C2 450mm → 4×100=400mm, 11.1% waste; or C3 300mm→3×100=0% waste)
    {
      customer: sharma._id, priority: 'normal', deadline: d(12),
      status: 'pending',
      line_items: [
        { width_mm: 100, thickness_mm: 1.00, hardness: 'medium', qty_kg: 1200, qty_tolerance_pct: 20, width_tolerance_mm: 0.2, gauge_tolerance_mm: 0.1 },
        { width_mm: 75, thickness_mm: 1.00, hardness: 'medium', qty_kg: 600, qty_tolerance_pct: 20, width_tolerance_mm: 0.2, gauge_tolerance_mm: 0.1 },
      ],
    },
    // ORD-0003 — Gupta Engineering — 80mm×1.50mm medium_hard (C5 200mm→2×80=160mm, 20% waste; C13 200mm→2×80=160mm, 20%)
    {
      customer: gupta._id, priority: 'normal', deadline: d(18),
      status: 'pending',
      line_items: [
        { width_mm: 80, thickness_mm: 1.50, hardness: 'medium_hard', qty_kg: 600, qty_tolerance_pct: 20, width_tolerance_mm: 0.2, gauge_tolerance_mm: 0.1 },
        { width_mm: 40, thickness_mm: 1.50, hardness: 'medium_hard', qty_kg: 350, qty_tolerance_pct: 20, width_tolerance_mm: 0.2, gauge_tolerance_mm: 0.1 },
      ],
    },
    // ORD-0004 — Patel Fabricators — high priority — 150mm×1.00mm (C2 450mm→3×150=450mm, 0% waste ⭐)
    {
      customer: patel._id, priority: 'high', deadline: d(7),
      status: 'pending',
      notes: 'Large order — priority dispatch to Rajkot',
      line_items: [
        { width_mm: 150, thickness_mm: 1.00, hardness: 'medium', qty_kg: 2000, qty_tolerance_pct: 15, width_tolerance_mm: 0.2, gauge_tolerance_mm: 0.1 },
        { width_mm: 200, thickness_mm: 2.00, hardness: 'medium', qty_kg: 1500, qty_tolerance_pct: 20, width_tolerance_mm: 0.5, gauge_tolerance_mm: 0.1 },
      ],
    },
    // ORD-0005 — Kumar Industries — 50mm×1.20mm semi_soft (C4 250mm→5×50=250mm, 0% waste ⭐) + 65mm×0.40mm (C9 130mm→2×65=130mm, 0% ⭐)
    {
      customer: kumar._id, priority: 'normal', deadline: d(20),
      status: 'pending',
      line_items: [
        { width_mm: 50, thickness_mm: 1.20, hardness: 'semi_soft', qty_kg: 700, qty_tolerance_pct: 20, width_tolerance_mm: 0.2, gauge_tolerance_mm: 0.1 },
        { width_mm: 65, thickness_mm: 0.40, hardness: 'semi_soft', qty_kg: 180, qty_tolerance_pct: 20, width_tolerance_mm: 0.2, gauge_tolerance_mm: 0.1 },
      ],
    },
    // ORD-0006 — Mehta Auto — 85mm×0.80mm soft (C11 300mm→3×85=255mm, 15% waste; or C1 520mm→6×85=510mm, 1.9% waste ⭐)
    {
      customer: mehta._id, priority: 'high', deadline: d(4),
      status: 'pending',
      notes: 'OEM supply — Chennai delivery',
      line_items: [
        { width_mm: 85, thickness_mm: 0.80, hardness: 'soft', qty_kg: 900, qty_tolerance_pct: 10, width_tolerance_mm: 0.2, gauge_tolerance_mm: 0.1 },
        { width_mm: 127, thickness_mm: 0.80, hardness: 'soft', qty_kg: 500, qty_tolerance_pct: 15, width_tolerance_mm: 0.2, gauge_tolerance_mm: 0.1, notes: 'Offcut from C11: 2×127=254mm, leftover 46mm reusable' },
      ],
    },
    // ORD-0007 — Singh Steel — 53mm×0.80mm hard (C7 160mm→3×53=159mm, 0.6% waste) — offcut 1mm only
    {
      customer: singh._id, priority: 'normal', deadline: d(25),
      status: 'pending',
      line_items: [
        { width_mm: 53, thickness_mm: 0.80, hardness: 'hard', qty_kg: 250, qty_tolerance_pct: 20, width_tolerance_mm: 0.2, gauge_tolerance_mm: 0.1 },
      ],
    },
    // ORD-0008 — Arora Precision — 66mm×1.50mm medium_hard (C13 200mm→3×66=198mm, 1% waste ⭐) + 40mm×1.50mm (C13 200mm→5×40=200mm, 0% ⭐)
    {
      customer: arora._id, priority: 'normal', deadline: d(15),
      status: 'pending',
      notes: 'Tight dimensional tolerances — check gauge carefully',
      line_items: [
        { width_mm: 66, thickness_mm: 1.50, hardness: 'medium_hard', qty_kg: 400, qty_tolerance_pct: 15, width_tolerance_mm: 0.1, gauge_tolerance_mm: 0.05 },
        { width_mm: 40, thickness_mm: 1.50, hardness: 'medium_hard', qty_kg: 280, qty_tolerance_pct: 15, width_tolerance_mm: 0.1, gauge_tolerance_mm: 0.05 },
      ],
    },
    // ORD-0009 — Rajesh Auto (repeat order) — already in_production
    {
      customer: rajesh._id, priority: 'normal', deadline: d(-3),
      status: 'in_production',
      notes: 'Repeat order — production started',
      line_items: [
        { width_mm: 47, thickness_mm: 0.80, hardness: 'soft', qty_kg: 500, qty_tolerance_pct: 20, width_tolerance_mm: 0.2, gauge_tolerance_mm: 0.1, status: 'in_production' },
      ],
    },
    // ORD-0010 — Patel Fabricators — dispatched
    {
      customer: patel._id, priority: 'normal', deadline: d(-10),
      status: 'dispatched',
      line_items: [
        { width_mm: 150, thickness_mm: 1.50, hardness: 'medium', qty_kg: 1800, qty_tolerance_pct: 20, width_tolerance_mm: 0.2, gauge_tolerance_mm: 0.1, status: 'fulfilled' },
      ],
    },
  ];

  const createdOrders = [];
  for (const def of orderDefs) {
    const order = new Order(def);
    await order.save();
    createdOrders.push(order);
  }
  console.log(`✓ Orders: ${createdOrders.length} created`);

  // ─── Cutting Jobs (historical + in-progress) ──────────────────────────────
  const machines = await Machine.find({});
  const slitter1 = machines.find(m => m.name === 'Slitter 1');
  const slitter2 = machines.find(m => m.name === 'Slitter 2');
  const shear1 = machines.find(m => m.name === 'Shearing Machine 1');
  const ctl = machines.find(m => m.name === 'CTL Line');

  if (!slitter1) {
    console.warn('⚠ Machines not found — run seedData.js first. Skipping cutting jobs.');
  } else {
    const c12 = createdCoils.find(c => c.width_mm === 520 && c.gauge_mm === 1.50); // partially used coil
    const ord9 = createdOrders.find(o => o.status === 'in_production');
    const ord10 = createdOrders.find(o => o.status === 'dispatched');

    const jobDefs = [
      // Completed job — for ORD-0010 (dispatched)
      {
        order: ord10._id,
        line_item_id: ord10.line_items[0]._id,
        machine: slitter1._id,
        inventory_item_id: c12._id,
        inventory_type: 'coil',
        material_weight_used_kg: 1800,
        cut_pieces: [{ width_mm: 150, count: 3 }],
        num_cuts: 3,
        wastage_kg: 18,
        wastage_pct: 0.99,
        scrap_kg: 18,
        estimated_time_hrs: 3.6,
        status: 'completed',
        scheduled_date: d(-12),
        completed_date: d(-11),
        notes: 'Smooth run, minimal waste',
      },
      // In-progress job — for ORD-0009
      {
        order: ord9._id,
        line_item_id: ord9.line_items[0]._id,
        machine: slitter2._id,
        inventory_item_id: createdCoils[0]._id,  // C1: 520mm soft
        inventory_type: 'coil',
        material_weight_used_kg: 500,
        cut_pieces: [{ width_mm: 47, count: 11 }],
        num_cuts: 10,
        wastage_kg: 4.8,
        wastage_pct: 0.96,
        scrap_kg: 4.8,
        estimated_time_hrs: 5.2,
        status: 'in_progress',
        scheduled_date: d(0),
        notes: 'Running on Slitter 2 — 10 cuts for 11 strips',
      },
      // Planned job for tomorrow
      {
        order: createdOrders[3]._id,   // ORD-0004 Patel
        line_item_id: createdOrders[3].line_items[0]._id,
        machine: slitter1._id,
        inventory_item_id: createdCoils[1]._id,  // C2: 450mm medium
        inventory_type: 'coil',
        material_weight_used_kg: 2000,
        cut_pieces: [{ width_mm: 150, count: 3 }],
        num_cuts: 2,
        wastage_kg: 0,
        wastage_pct: 0.0,
        scrap_kg: 0,
        estimated_time_hrs: 4.1,
        status: 'planned',
        scheduled_date: d(1),
        notes: 'Zero waste plan — 3×150=450mm exact',
      },
    ];

    for (const def of jobDefs) {
      const job = new CuttingJob(def);
      await job.save();
    }
    console.log(`✓ Cutting Jobs: ${jobDefs.length} created`);
  }

  console.log('\n✅ Mock data seeded successfully!');
  console.log('\nWhat to demo:');
  console.log('  Dashboard     — 6 pending orders, 2 high-priority, 13 coils, 5 sheet types in stock');
  console.log('  Optimization  — ORD-0004 + 150mm + coil → 3×150mm from 450mm coil = 0% waste ⭐');
  console.log('  Optimization  — ORD-0005 + 50mm  + coil → 5×50mm  from 250mm coil = 0% waste ⭐');
  console.log('  Optimization  — ORD-0006 + 127mm + coil → 2×127mm from 300mm coil, leftover 46mm → Mehta preferred size ♻️');
  console.log('  Optimization  — ORD-0007 + 53mm  + coil → 3×53mm  from 160mm coil = 0.6% waste');
  console.log('  Production    — 1 completed job, 1 in-progress, 1 planned for tomorrow');
  console.log('  Scrap         — scrap from completed job visible');

  mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
