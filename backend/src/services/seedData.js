/**
 * Seed script — creates default users, machines, and settings
 * Run: node src/services/seedData.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Machine = require('../models/Machine');
const Settings = require('../models/Settings');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/iron_steel_db';

const machines = [
  {
    name: 'Slitter 1',
    type: 'slitter',
    status: 'active',
    width_min_mm: 8,
    width_max_mm: 520,
    thickness_ranges: [
      { hardness: 'soft', min_mm: 0.30, max_mm: 3.00 },
      { hardness: 'semi_soft', min_mm: 0.30, max_mm: 3.00 },
      { hardness: 'medium', min_mm: 0.30, max_mm: 3.00 },
      { hardness: 'medium_hard', min_mm: 0.30, max_mm: 2.50 },
      { hardness: 'hard', min_mm: 0.30, max_mm: 2.00 },
    ],
    speed_tiers: [
      { gauge_min: 0.30, gauge_max: 1.00, base_time_hrs_per_ton: 2.25 },
      { gauge_min: 1.00, gauge_max: 2.00, base_time_hrs_per_ton: 1.075 },
      { gauge_min: 2.00, gauge_max: 3.00, base_time_hrs_per_ton: 0.75 },
    ],
    cut_baseline: 2,
    small_cut_mm: 17,
    small_cut_factor: 1.3,
    setup_change_hrs: 1.5,
  },
  {
    name: 'Slitter 2',
    type: 'slitter',
    status: 'active',
    width_min_mm: 15,
    width_max_mm: 180,
    thickness_ranges: [
      { hardness: 'soft', min_mm: 0.30, max_mm: 1.80 },
      { hardness: 'semi_soft', min_mm: 0.30, max_mm: 1.80 },
      { hardness: 'medium', min_mm: 0.30, max_mm: 1.80 },
      { hardness: 'medium_hard', min_mm: 0.30, max_mm: 1.50 },
      { hardness: 'hard', min_mm: 0.30, max_mm: 1.50 },
    ],
    speed_tiers: [
      { gauge_min: 0.30, gauge_max: 0.50, base_time_hrs_per_ton: 5.0 },
      { gauge_min: 0.50, gauge_max: 0.90, base_time_hrs_per_ton: 2.25 },
      { gauge_min: 0.90, gauge_max: 1.80, base_time_hrs_per_ton: 0.625 },
    ],
    cut_baseline: 2,
    small_cut_mm: 17,
    small_cut_factor: 1.3,
    setup_change_hrs: 1.5,
  },
  {
    name: 'Slitter 3',
    type: 'slitter',
    status: 'active',
    width_min_mm: 9,
    width_max_mm: 160,
    thickness_ranges: [
      { hardness: 'soft', min_mm: 0.25, max_mm: 2.00 },
      { hardness: 'semi_soft', min_mm: 0.25, max_mm: 2.00 },
      { hardness: 'medium', min_mm: 0.25, max_mm: 2.00 },
      { hardness: 'medium_hard', min_mm: 0.25, max_mm: 2.00 },
      { hardness: 'hard', min_mm: 0.25, max_mm: 2.00 },
    ],
    speed_tiers: [
      { gauge_min: 0.30, gauge_max: 0.50, base_time_hrs_per_ton: 24 },
      { gauge_min: 0.50, gauge_max: 1.00, base_time_hrs_per_ton: 15 },
      { gauge_min: 1.00, gauge_max: 1.60, base_time_hrs_per_ton: 12 },
    ],
    cut_baseline: 2,
    small_cut_mm: 17,
    small_cut_factor: 1.3,
    setup_change_hrs: 1.5,
    notes: 'Output measured per 12-hour shift',
  },
  {
    name: 'Shearing Machine 1',
    type: 'shear',
    status: 'active',
    width_min_mm: 15,
    width_max_mm: 2500,
    thickness_ranges: [
      { hardness: 'soft', min_mm: 0.50, max_mm: 6.00 },
      { hardness: 'semi_soft', min_mm: 0.50, max_mm: 6.00 },
      { hardness: 'medium', min_mm: 0.50, max_mm: 6.00 },
      { hardness: 'medium_hard', min_mm: 0.50, max_mm: 6.00 },
      { hardness: 'hard', min_mm: 0.50, max_mm: 6.00 },
    ],
    speed_tiers: [
      { gauge_min: 0.50, gauge_max: 0.70, base_time_hrs_per_ton: 2.75 },
      { gauge_min: 0.70, gauge_max: 0.90, base_time_hrs_per_ton: 1.75 },
      { gauge_min: 0.90, gauge_max: 1.60, base_time_hrs_per_ton: 1.0 },
      { gauge_min: 1.60, gauge_max: 2.00, base_time_hrs_per_ton: 0.75 },
      { gauge_min: 2.00, gauge_max: 2.50, base_time_hrs_per_ton: 0.583 },
      { gauge_min: 2.50, gauge_max: 3.00, base_time_hrs_per_ton: 0.5 },
      { gauge_min: 3.00, gauge_max: 4.00, base_time_hrs_per_ton: 0.417 },
      { gauge_min: 4.00, gauge_max: 6.00, base_time_hrs_per_ton: 0.333 },
    ],
    setup_change_hrs: 1.0,
    notes: 'Max cut length: 2500mm for widths ≤15mm; 1500mm for widths ≥17mm',
  },
  {
    name: 'Shearing Machine 2',
    type: 'shear',
    status: 'active',
    width_min_mm: 17,
    width_max_mm: 1500,
    thickness_ranges: [
      { hardness: 'soft', min_mm: 0.40, max_mm: 2.50 },
      { hardness: 'semi_soft', min_mm: 0.40, max_mm: 2.50 },
      { hardness: 'medium', min_mm: 0.40, max_mm: 2.50 },
      { hardness: 'medium_hard', min_mm: 0.40, max_mm: 2.50 },
      { hardness: 'hard', min_mm: 0.40, max_mm: 2.50 },
    ],
    speed_tiers: [
      { gauge_min: 0.30, gauge_max: 0.80, base_time_hrs_per_ton: 3.0 },
      { gauge_min: 0.80, gauge_max: 1.00, base_time_hrs_per_ton: 2.5 },
      { gauge_min: 1.00, gauge_max: 1.60, base_time_hrs_per_ton: 2.0 },
      { gauge_min: 1.60, gauge_max: 2.50, base_time_hrs_per_ton: 1.25 },
    ],
    setup_change_hrs: 1.0,
    notes: 'Max cut length: 1500mm',
  },
  {
    name: 'CTL Line',
    type: 'ctl',
    status: 'active',
    width_min_mm: 25,
    width_max_mm: 600,
    thickness_ranges: [
      { hardness: 'soft', min_mm: 0.30, max_mm: 4.00 },
      { hardness: 'semi_soft', min_mm: 0.30, max_mm: 4.00 },
      { hardness: 'medium', min_mm: 0.30, max_mm: 4.00 },
      { hardness: 'medium_hard', min_mm: 0.30, max_mm: 4.00 },
      { hardness: 'hard', min_mm: 0.30, max_mm: 4.00 },
    ],
    speed_tiers: [
      { gauge_min: 0.30, gauge_max: 4.00, base_time_hrs_per_ton: 1.0 },
    ],
    setup_change_hrs: 1.5,
    notes: 'Cut length configured per job by operator',
  },
];

/**
 * Seeds default users, machines, and settings using an EXISTING mongoose connection.
 * Idempotent — each section is skipped if it already exists, so it is safe to run
 * repeatedly (e.g. on every boot when SEED_ON_START=true).
 */
async function seedData() {
  // Users
  const existingOwner = await User.findOne({ username: 'owner1' });
  if (!existingOwner) {
    await User.create({ username: 'owner1', password: 'IronBiz@2024', role: 'owner' });
    await User.create({ username: 'owner2', password: 'IronBiz@2024', role: 'owner' });
    await User.create({ username: 'supervisor', password: 'Super@2024', role: 'supervisor' });
    console.log('Users created');
  }

  // Machines
  const existingMachines = await Machine.countDocuments();
  if (existingMachines === 0) {
    await Machine.insertMany(machines);
    console.log('Machines seeded');
  }

  // Settings
  const existingSettings = await Settings.findOne({ singleton_key: 'app_settings' });
  if (!existingSettings) {
    await Settings.create({ singleton_key: 'app_settings' });
    console.log('Settings initialized');
  }

  console.log('Seed complete');
}

module.exports = { seedData, machines };

// CLI mode: `node src/services/seedData.js` — manages its own connection.
if (require.main === module) {
  (async () => {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');
    await seedData();
    console.log('\nLogins:');
    console.log('  owner1 / IronBiz@2024  (Owner)');
    console.log('  owner2 / IronBiz@2024  (Owner)');
    console.log('  supervisor / Super@2024  (Supervisor)');
    await mongoose.disconnect();
  })().catch(err => { console.error(err); process.exit(1); });
}
