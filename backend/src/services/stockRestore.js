const { Coil, Sheet } = require('../models/Inventory');

/**
 * Reverse the inventory deduction a cutting job made: returns the material to the
 * source coil/sheet and undoes any leftover-coil restock, so cancelling a job or an
 * order never silently loses stock.
 *
 * - If a leftover strip was restocked as a new coil and it is still untouched, that
 *   coil is removed and the full amount goes back to the source.
 * - If the leftover coil has already been partly used elsewhere, it is kept and only
 *   the order's own portion is returned (never double-counts the leftover).
 *
 * Call once per job. Callers must ensure the job was not already cancelled/restored.
 * Returns the kg actually restored.
 */
async function restoreJobStock(job, reference, note) {
  let restore = job.material_weight_used_kg || 0;

  if (job.restocked_coil_id) {
    const lc = await Coil.findById(job.restocked_coil_id);
    if (lc) {
      const untouched = Math.abs((lc.remaining_weight_kg ?? 0) - (lc.weight_kg ?? 0)) < 0.001;
      if (untouched) await Coil.findByIdAndDelete(lc._id);
      else restore = Math.max(0, restore - (lc.weight_kg || 0));
    }
  }

  const Model = job.inventory_type === 'coil' ? Coil : Sheet;
  const item = await Model.findById(job.inventory_item_id);
  if (item && restore > 0) {
    const restored = Math.min(item.weight_kg, (item.remaining_weight_kg || 0) + restore);
    item.remaining_weight_kg = parseFloat(restored.toFixed(3));
    item.movements.push({
      type: 'adjustment',
      weight_kg: parseFloat(restore.toFixed(3)),
      reference,
      notes: note || `Returned to stock (job ${job.job_number})`,
    });
    await item.save();
    return parseFloat(restore.toFixed(3));
  }
  return 0;
}

module.exports = { restoreJobStock };
