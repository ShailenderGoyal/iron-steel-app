/**
 * Production Planning Service
 * Generates a daily/weekly schedule from pending CuttingJobs
 */

const CuttingJob = require('../models/CuttingJob');
const Machine = require('../models/Machine');
const Settings = require('../models/Settings');

/**
 * Returns total break time in hours for the day (from settings).
 */
function getBreakHours(settings) {
  if (!settings || !settings.break_times) return 1.75; // default ~105 min
  return settings.break_times
    .filter(b => b.enabled)
    .reduce((sum, b) => sum + b.duration_min / 60, 0);
}

/**
 * Generate a daily production plan for a given date.
 * Groups jobs by machine, orders by priority (high first) and deadline.
 */
async function generateDailyPlan(date) {
  const settings = await Settings.findOne({ singleton_key: 'app_settings' });
  const working_hrs = settings?.working_hours_per_day || 10;
  const break_hrs = getBreakHours(settings);
  const available_hrs = working_hrs - break_hrs;

  const machines = await Machine.find({ status: 'active' });

  // Get planned/in_progress jobs
  const jobs = await CuttingJob.find({
    status: { $in: ['planned', 'in_progress'] },
  })
    .populate({ path: 'order', select: 'order_number priority deadline customer', populate: { path: 'customer', select: 'name' } })
    .populate('machine', 'name type setup_change_hrs')
    .sort([['order.priority', -1], ['order.deadline', 1]]);

  const schedule = {};

  for (const machine of machines) {
    const machineJobs = jobs.filter(j => j.machine?._id?.toString() === machine._id.toString());

    let time_used = 0;
    const planned = [];
    let last_width = null;

    for (const job of machineJobs) {
      const setup_time = last_width !== null ? (machine.setup_change_hrs || 1.5) : 0;
      const job_time = job.estimated_time_hrs || 0;
      const total_time = setup_time + job_time;

      if (time_used + total_time > available_hrs) {
        // Overflow — goes to next day
        planned.push({
          job_number: job.job_number,
          order_number: job.order?.order_number,
          customer: job.order?.customer?.name,
          priority: job.order?.priority,
          deadline: job.order?.deadline,
          estimated_time_hrs: job_time,
          setup_time_hrs: setup_time,
          overflow: true,
          status: job.status,
        });
        continue;
      }

      time_used += total_time;
      last_width = job.cut_pieces?.[0]?.width_mm;

      planned.push({
        job_number: job.job_number,
        order_number: job.order?.order_number,
        customer: job.order?.customer?.name,
        priority: job.order?.priority,
        deadline: job.order?.deadline,
        estimated_time_hrs: job_time,
        setup_time_hrs: setup_time,
        overflow: false,
        status: job.status,
      });
    }

    schedule[machine._id] = {
      machine_id: machine._id,
      machine_name: machine.name,
      machine_type: machine.type,
      available_hrs,
      used_hrs: parseFloat(time_used.toFixed(2)),
      remaining_hrs: parseFloat((available_hrs - time_used).toFixed(2)),
      jobs: planned,
    };
  }

  return { date, available_hrs, schedule };
}

module.exports = { generateDailyPlan };
