/**
 * Cutting Optimization Engine — Phase 3
 * Rohini Ispat
 *
 * Machine model (confirmed with the business):
 *   - Slitter : changes WIDTH only (coil -> narrower coil)
 *   - Shear   : cuts LENGTH only (coil or sheet -> sheets, at current width)
 *   - CTL     : unrolls + straightens + cuts to LENGTH (coil -> sheets, at coil width)
 *   coil -> sheet: yes.   sheet -> coil: never.
 *
 * Routing:
 *   - Order with NO length  -> COIL output: slitter only. Leftover strip >= cutoff is
 *     reusable stock (NOT wastage); below cutoff it is scrap.
 *   - Order WITH length     -> SHEET output:
 *       from a coil:  slitter (width, only if wider than needed) then shear OR CTL (length)
 *       from a sheet: width must already match, then shear (length)
 */

const { Coil, Sheet } = require('../models/Inventory');

const r2 = (n) => parseFloat(Number(n).toFixed(2));
const r3 = (n) => parseFloat(Number(n).toFixed(3));

// Directional tolerance range around a target dimension.
//   both  -> [t-tol, t+tol]   plus -> [t, t+tol] (over only)   minus -> [t-tol, t] (under only)
function tolRange(target, tol, dir) {
  tol = Math.abs(tol || 0);
  if (dir === 'plus') return { min: target, max: target + tol };
  if (dir === 'minus') return { min: target - tol, max: target };
  return { min: target - tol, max: target + tol };
}

// ---- Machine capability (per the confirmed model) ----
function fitsWidth(m, width_mm) {
  return width_mm >= m.width_min_mm && width_mm <= m.width_max_mm;
}
function fitsGauge(m, gauge_mm, hardness) {
  const tr = m.thickness_ranges.find(t => t.hardness === hardness);
  return !!tr && gauge_mm >= tr.min_mm && gauge_mm <= tr.max_mm;
}
// Slitters process the whole coil width and reduce it.
function capableSlitters(machines, coilWidth, gauge, hardness) {
  return machines.filter(m => m.status === 'active' && m.type === 'slitter' && fitsWidth(m, coilWidth) && fitsGauge(m, gauge, hardness));
}
// Shear + CTL cut length; the material width being fed must fit the machine.
function capableLengthCutters(machines, feedWidth, gauge, hardness, types) {
  return machines.filter(m => m.status === 'active' && types.includes(m.type) && fitsWidth(m, feedWidth) && fitsGauge(m, gauge, hardness));
}

function getSpeedTier(m, gauge) {
  return m.speed_tiers.find(t => gauge >= t.gauge_min && gauge <= t.gauge_max) || null;
}
function slitterTime(m, gauge, numCuts, hasSmall, tons) {
  const tier = getSpeedTier(m, gauge);
  if (!tier) return null;
  const cutMult = numCuts / (m.cut_baseline || 2);
  const smallMult = hasSmall ? (m.small_cut_factor || 1.3) : 1;
  return r3(tier.base_time_hrs_per_ton * cutMult * smallMult * tons);
}
function lengthCutTime(m, gauge, tons) {
  const tier = getSpeedTier(m, gauge);
  if (!tier) return null;
  return r3(tier.base_time_hrs_per_ton * tons);
}

// Reusable leftover strips that match another pending order or a customer preferred size.
function findOffcuts(width_mm, gauge, hardness, pendingOrders, customers, tol) {
  const out = [];
  if (!width_mm || width_mm <= 0) return out;
  for (const order of pendingOrders || []) {
    for (const li of order.line_items || []) {
      if (li.status === 'fulfilled') continue;
      const t = li.width_tolerance_mm || 0.2;
      if (Math.abs(li.width_mm - width_mm) <= t && li.thickness_mm === gauge && li.hardness === hardness) {
        out.push({ type: 'order', order_number: order.order_number, width_mm: r2(width_mm) });
      }
    }
  }
  for (const c of customers || []) {
    for (const ps of c.preferred_sizes || []) {
      if (!ps.width_mm) continue;
      if (Math.abs(ps.width_mm - width_mm) <= (tol || 0.2) && (!ps.thickness_mm || ps.thickness_mm === gauge)) {
        out.push({ type: 'customer', customer_name: c.name, width_mm: r2(width_mm) });
      }
    }
  }
  return out;
}

// ===== COIL output (order has no length): slitter only =====
async function optimizeToCoils(lineItem, allMachines, pendingOrders, customers, settings, top_n = 5) {
  const { width_mm: reqW, thickness_mm, hardness, qty_kg, width_tolerance_mm = 0.2, gauge_tolerance_mm = 0.1, gauge_tol_dir = 'minus' } = lineItem;
  const cutoff = settings?.min_reusable_coil_width_mm ?? 25;
  const gr = tolRange(thickness_mm, gauge_tolerance_mm, gauge_tol_dir);

  const coils = await Coil.find({
    isActive: true, remaining_weight_kg: { $gt: 0 }, hardness,
    gauge_mm: { $gte: gr.min, $lte: gr.max },
  }).populate('supplier', 'name');

  const options = [];
  for (const coil of coils) {
    const cw = coil.width_mm, gauge = coil.gauge_mm;
    const slitterMachines = capableSlitters(allMachines, cw, gauge, hardness);
    if (slitterMachines.length === 0) continue;

    for (let mult = 1; mult <= 3; mult++) {
      const target = reqW * mult;
      if (target > cw + width_tolerance_mm) continue;
      const n = Math.floor(cw / target);
      if (n < 1) continue;

      const leftoverW = cw - n * target;
      const scrapW = leftoverW < cutoff ? leftoverW : 0;      // only sub-cutoff leftover is scrap
      const reusableW = leftoverW >= cutoff ? leftoverW : 0;  // wider leftover is restocked
      const kgPerMm = coil.weight_kg / cw;
      const scrapKg = scrapW * kgPerMm;

      const numCuts = n; // n strips + a leftover strip => n slits
      const hasSmall = target < (slitterMachines[0].small_cut_mm || 17);
      const tons = Math.min(qty_kg, coil.remaining_weight_kg) / 1000;
      const machines = slitterMachines.map(m => ({
        machine_id: m._id, machine_name: m.name, machine_type: m.type,
        estimated_time_hrs: slitterTime(m, gauge, numCuts, hasSmall, tons),
      }));

      options.push({
        output: 'coil',
        coil_id: coil._id,
        coil_info: { width_mm: cw, gauge_mm: gauge, hardness: coil.hardness, remaining_weight_kg: coil.remaining_weight_kg, supplier: coil.supplier?.name, rust_level: coil.rust_level },
        multiple: mult,
        pieces_per_coil_width: n,
        cut_width_mm: target,
        num_cuts: numCuts,
        leftover_width_mm: r3(leftoverW),
        reusable_width_mm: r3(reusableW),
        scrap_width_mm: r3(scrapW),
        wastage_pct: r2((scrapW / cw) * 100),
        wastage_kg: r3(scrapKg),
        scrap_kg: r3(scrapKg),
        machines,
        offcut_reuse: findOffcuts(reusableW, gauge, hardness, pendingOrders, customers, width_tolerance_mm),
        score: (scrapW / cw) * 100,
      });
    }
  }
  options.sort((a, b) => a.score - b.score);
  return options.slice(0, top_n);
}

// ===== SHEET output (order has length): existing sheets (shear) + coils (slit + shear/CTL) =====
async function optimizeToSheets(lineItem, allMachines, pendingOrders, customers, settings, top_n = 5) {
  const { width_mm: reqW, length_mm: reqL, thickness_mm, hardness, qty_kg,
    width_tolerance_mm = 2, length_tolerance_mm = 0.5, gauge_tolerance_mm = 0.1,
    gauge_tol_dir = 'minus', width_tol_dir = 'both' } = lineItem;
  const cutoff = settings?.min_reusable_coil_width_mm ?? 25;
  const gr = tolRange(thickness_mm, gauge_tolerance_mm, gauge_tol_dir);
  const wr = tolRange(reqW, width_tolerance_mm, width_tol_dir);
  const options = [];

  // --- From existing sheets: width must already match; shear to length ---
  const sheets = await Sheet.find({
    isActive: true, remaining_weight_kg: { $gt: 0 }, hardness,
    thickness_mm: { $gte: gr.min, $lte: gr.max },
  }).populate('supplier', 'name');

  for (const sheet of sheets) {
    if (sheet.width_mm < wr.min || sheet.width_mm > wr.max) continue; // can't re-slit a sheet's width
    const nLen = Math.floor((sheet.length_mm + length_tolerance_mm) / reqL);
    if (nLen < 1) continue;
    const leftoverLen = Math.max(0, sheet.length_mm - nLen * reqL);
    const wastagePct = (leftoverLen / sheet.length_mm) * 100;
    const wastageKg = (sheet.weight_per_sheet_kg || 0) * (leftoverLen / sheet.length_mm);
    const shears = capableLengthCutters(allMachines, sheet.width_mm, sheet.thickness_mm, hardness, ['shear']);
    if (shears.length === 0) continue;
    const tons = Math.min(qty_kg, sheet.remaining_weight_kg) / 1000;
    options.push({
      output: 'sheet', source: 'sheet',
      sheet_id: sheet._id,
      sheet_info: { length_mm: sheet.length_mm, width_mm: sheet.width_mm, thickness_mm: sheet.thickness_mm, hardness: sheet.hardness, format_preset: sheet.format_preset, remaining_weight_kg: sheet.remaining_weight_kg, supplier: sheet.supplier?.name, rust_level: sheet.rust_level },
      cut_width_mm: reqW, cut_length_mm: reqL,
      pieces_per_sheet: nLen,
      needs_slit: false, slit_step: null,
      wastage_pct: r2(Math.max(0, wastagePct)), wastage_kg: r3(wastageKg), scrap_kg: r3(wastageKg),
      machines: shears.map(m => ({ machine_id: m._id, machine_name: m.name, machine_type: m.type, estimated_time_hrs: lengthCutTime(m, sheet.thickness_mm, tons) })),
      offcut_reuse: [],
      score: Math.max(0, wastagePct),
    });
  }

  // --- From coils: slit to width (if wider) then shear/CTL to length ---
  const coils = await Coil.find({
    isActive: true, remaining_weight_kg: { $gt: 0 }, hardness,
    gauge_mm: { $gte: gr.min, $lte: gr.max },
  }).populate('supplier', 'name');

  for (const coil of coils) {
    const cw = coil.width_mm, gauge = coil.gauge_mm;
    if (cw + width_tolerance_mm < reqW) continue; // can't widen a coil
    const strips = Math.floor(cw / reqW);
    if (strips < 1) continue;
    const leftoverW = cw - strips * reqW;
    const scrapW = leftoverW < cutoff ? leftoverW : 0;
    const reusableW = leftoverW >= cutoff ? leftoverW : 0;
    const scrapKg = scrapW * (coil.weight_kg / cw);
    const needsSlit = cw - reqW > width_tolerance_mm; // wider than one strip => must slit

    // Length cutters (shear + CTL) that can feed a strip of width reqW
    const cutters = capableLengthCutters(allMachines, reqW, gauge, hardness, ['shear', 'ctl']);
    if (cutters.length === 0) continue;

    // Slitter for the width step (only if needed) — must handle the full coil width
    let slitStep = null;
    if (needsSlit) {
      const slits = capableSlitters(allMachines, cw, gauge, hardness);
      if (slits.length === 0) continue; // wider coil but nothing can slit it -> not feasible
      const tons = Math.min(qty_kg, coil.remaining_weight_kg) / 1000;
      const s = slits[0];
      slitStep = { machine_id: s._id, machine_name: s.name, to_width_mm: reqW, strips, estimated_time_hrs: slitterTime(s, gauge, strips, reqW < (s.small_cut_mm || 17), tons) };
    }

    const tons = Math.min(qty_kg, coil.remaining_weight_kg) / 1000;
    options.push({
      output: 'sheet', source: 'coil',
      coil_id: coil._id,
      coil_info: { width_mm: cw, gauge_mm: gauge, hardness: coil.hardness, remaining_weight_kg: coil.remaining_weight_kg, supplier: coil.supplier?.name, rust_level: coil.rust_level },
      cut_width_mm: reqW, cut_length_mm: reqL,
      strips,
      needs_slit: needsSlit, slit_step: slitStep,
      leftover_width_mm: r3(leftoverW), reusable_width_mm: r3(reusableW), scrap_width_mm: r3(scrapW),
      wastage_pct: r2((scrapW / cw) * 100), wastage_kg: r3(scrapKg), scrap_kg: r3(scrapKg), // coil length is continuous -> only width leftover is scrap
      machines: cutters.map(m => ({ machine_id: m._id, machine_name: m.name, machine_type: m.type, estimated_time_hrs: lengthCutTime(m, gauge, tons) })),
      offcut_reuse: findOffcuts(reusableW, gauge, hardness, pendingOrders, customers, width_tolerance_mm),
      score: (scrapW / cw) * 100,
    });
  }

  options.sort((a, b) => a.score - b.score);
  return options.slice(0, top_n);
}

module.exports = { optimizeToCoils, optimizeToSheets, capableSlitters, capableLengthCutters };
