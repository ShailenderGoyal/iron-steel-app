/**
 * Cutting Optimization Engine — Phase 1 Greedy Algorithm
 * Iron & Steel Processing Business Management System
 */

const { Coil, Sheet } = require('../models/Inventory');
const Machine = require('../models/Machine');
const Customer = require('../models/Customer');
const Order = require('../models/Order');

function findCapableMachines(machines, width_mm, gauge_mm, hardness) {
  return machines.filter(m => {
    if (m.status !== 'active') return false;
    if (width_mm < m.width_min_mm || width_mm > m.width_max_mm) return false;
    const tr = m.thickness_ranges.find(r => r.hardness === hardness);
    if (!tr) return false;
    if (gauge_mm < tr.min_mm || gauge_mm > tr.max_mm) return false;
    return true;
  });
}

function getSpeedTier(machine, gauge_mm) {
  return machine.speed_tiers.find(t => gauge_mm >= t.gauge_min && gauge_mm <= t.gauge_max) || null;
}

function estimateSlitterTime(machine, gauge_mm, num_cuts, has_small_cuts, quantity_tons) {
  const tier = getSpeedTier(machine, gauge_mm);
  if (!tier) return null;
  const cut_multiplier = num_cuts / (machine.cut_baseline || 2);
  const small_cut_factor = has_small_cuts ? (machine.small_cut_factor || 1.3) : 1.0;
  return tier.base_time_hrs_per_ton * cut_multiplier * small_cut_factor * quantity_tons;
}

function estimateShearTime(machine, gauge_mm, quantity_tons) {
  const tier = getSpeedTier(machine, gauge_mm);
  if (!tier) return null;
  return tier.base_time_hrs_per_ton * quantity_tons;
}

async function optimizeCoilCutting(lineItem, allMachines, pendingOrders, allCustomers, top_n = 5) {
  const { width_mm: required_width, thickness_mm, hardness, qty_kg, width_tolerance_mm = 0.2, gauge_tolerance_mm = 0.1 } = lineItem;

  const coils = await Coil.find({
    isActive: true,
    remaining_weight_kg: { $gt: 0 },
    hardness,
    gauge_mm: { $gte: thickness_mm - gauge_tolerance_mm, $lte: thickness_mm },
  }).populate('supplier', 'name');

  const options = [];

  for (const coil of coils) {
    const coil_width = coil.width_mm;
    const gauge = coil.gauge_mm;

    for (let multiple = 1; multiple <= 3; multiple++) {
      const target_width = required_width * multiple;
      if (target_width > coil_width + width_tolerance_mm) continue;

      const n = Math.floor(coil_width / target_width);
      if (n < 1) continue;

      const useful_width = n * target_width;
      const leftover_width = coil_width - useful_width;
      const wastage_pct = (leftover_width / coil_width) * 100;
      const coil_weight_per_mm_width = coil.weight_kg / coil_width;
      const wastage_kg = leftover_width * coil_weight_per_mm_width;

      const capable_machines = findCapableMachines(allMachines, coil_width, gauge, hardness);
      if (capable_machines.length === 0) continue;

      const num_cuts = n > 1 ? n - 1 : 1;
      const has_small_cuts = target_width < (capable_machines[0]?.small_cut_mm || 17);
      const quantity_tons = Math.min(qty_kg, coil.remaining_weight_kg) / 1000;

      const machine_options = capable_machines.map(m => {
        const est_time = m.type === 'slitter'
          ? estimateSlitterTime(m, gauge, num_cuts + 1, has_small_cuts, quantity_tons)
          : estimateShearTime(m, gauge, quantity_tons);
        return { machine_id: m._id, machine_name: m.name, machine_type: m.type, estimated_time_hrs: est_time };
      });

      const offcut_matches = [];
      if (leftover_width > 0) {
        for (const order of pendingOrders) {
          for (const li of order.line_items) {
            if (li.status === 'fulfilled') continue;
            const tol = li.width_tolerance_mm || 0.2;
            if (Math.abs(li.width_mm - leftover_width) <= tol && li.thickness_mm === gauge && li.hardness === hardness) {
              offcut_matches.push({ type: 'order', order_number: order.order_number, width_mm: leftover_width });
            }
          }
        }
        for (const customer of allCustomers) {
          for (const ps of customer.preferred_sizes || []) {
            if (!ps.width_mm) continue;
            if (Math.abs(ps.width_mm - leftover_width) <= 0.2 && (!ps.thickness_mm || ps.thickness_mm === gauge)) {
              offcut_matches.push({ type: 'customer', customer_name: customer.name, width_mm: leftover_width });
            }
          }
        }
      }

      options.push({
        coil_id: coil._id,
        coil_info: {
          width_mm: coil.width_mm,
          gauge_mm: coil.gauge_mm,
          hardness: coil.hardness,
          remaining_weight_kg: coil.remaining_weight_kg,
          supplier: coil.supplier?.name,
        },
        multiple,
        pieces_per_coil_width: n,
        cut_width_mm: target_width,
        num_cuts,
        leftover_width_mm: parseFloat(leftover_width.toFixed(3)),
        wastage_pct: parseFloat(wastage_pct.toFixed(2)),
        wastage_kg: parseFloat(wastage_kg.toFixed(3)),
        scrap_kg: parseFloat(wastage_kg.toFixed(3)),
        machines: machine_options,
        offcut_reuse: offcut_matches,
        score: wastage_pct,
      });
    }
  }

  options.sort((a, b) => a.score - b.score);
  return options.slice(0, top_n);
}

async function optimizeSheetCutting(lineItem, allMachines, top_n = 5) {
  const { width_mm: req_w, thickness_mm, hardness, qty_kg, width_tolerance_mm = 2, length_tolerance_mm = 0.5 } = lineItem;
  const req_l = lineItem.length_mm;

  const sheets = await Sheet.find({
    isActive: true,
    remaining_weight_kg: { $gt: 0 },
    hardness,
    thickness_mm: { $lte: thickness_mm, $gte: thickness_mm - 0.1 },
  }).populate('supplier', 'name');

  const options = [];

  for (const sheet of sheets) {
    const sw = sheet.width_mm;
    const sl = sheet.length_mm;
    const gauge = sheet.thickness_mm;

    const n_w = req_w ? Math.floor((sw + width_tolerance_mm) / req_w) : 1;
    const n_l = req_l ? Math.floor((sl + length_tolerance_mm) / req_l) : 1;
    if (n_w < 1 || n_l < 1) continue;

    const useful_area = n_w * req_w * n_l * (req_l || sl);
    const total_area = sw * sl;
    const wastage_pct = ((total_area - useful_area) / total_area) * 100;
    const wastage_kg_per_sheet = sheet.weight_per_sheet_kg * Math.max(0, wastage_pct / 100);

    const capable_machines = findCapableMachines(allMachines, sw, gauge, hardness);
    if (capable_machines.length === 0) continue;

    const quantity_tons = Math.min(qty_kg, sheet.remaining_weight_kg) / 1000;
    const machine_options = capable_machines.map(m => {
      const est_time = estimateShearTime(m, gauge, quantity_tons);
      return { machine_id: m._id, machine_name: m.name, machine_type: m.type, estimated_time_hrs: est_time };
    });

    options.push({
      sheet_id: sheet._id,
      sheet_info: {
        length_mm: sl,
        width_mm: sw,
        thickness_mm: gauge,
        hardness: sheet.hardness,
        format_preset: sheet.format_preset,
        remaining_weight_kg: sheet.remaining_weight_kg,
        supplier: sheet.supplier?.name,
      },
      pieces_per_sheet: n_w * n_l,
      wastage_pct: parseFloat(Math.max(0, wastage_pct).toFixed(2)),
      wastage_kg: parseFloat(wastage_kg_per_sheet.toFixed(3)),
      machines: machine_options,
      offcut_reuse: [],
      score: wastage_pct,
    });
  }

  options.sort((a, b) => a.score - b.score);
  return options.slice(0, top_n);
}

module.exports = { optimizeCoilCutting, optimizeSheetCutting, findCapableMachines, estimateSlitterTime, estimateShearTime };
