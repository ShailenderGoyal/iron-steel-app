const Order = require('../models/Order');

/**
 * Keep a line item's produced-so-far (fulfilled_kg) in step with its cutting job's status.
 * Called whenever a job's status changes: when it becomes 'completed' the job's output is
 * credited to the line item; when it leaves 'completed' the credit is removed. This is what
 * lets dispatch compare "produced vs ordered" and warn when shipping more than was made.
 *
 * Falls back to the line item's ordered qty when a legacy job has no output_kg recorded.
 */
async function applyFulfillmentChange(job, oldStatus, newStatus) {
  if (!job || !job.order || !job.line_item_id) return;
  const becameDone = newStatus === 'completed' && oldStatus !== 'completed';
  const undone = oldStatus === 'completed' && newStatus !== 'completed';
  if (!becameDone && !undone) return;

  const order = await Order.findById(job.order);
  if (!order) return;
  const li = order.line_items.id(job.line_item_id);
  if (!li) return;

  const amount = job.output_kg != null && job.output_kg > 0 ? job.output_kg : (li.qty_kg || 0);
  const sign = becameDone ? 1 : -1;
  const next = Math.max(0, (li.fulfilled_kg || 0) + sign * amount);
  li.fulfilled_kg = parseFloat(next.toFixed(3));
  li.status = li.fulfilled_kg >= li.qty_kg - 0.001 ? 'fulfilled' : (li.fulfilled_kg > 0 ? 'in_production' : 'pending');
  await order.save();
}

module.exports = { applyFulfillmentChange };
