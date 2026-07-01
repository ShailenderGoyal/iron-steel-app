const mongoose = require('mongoose');

const thicknessRangeSchema = new mongoose.Schema({
  hardness: { type: String, enum: ['soft', 'semi_soft', 'medium', 'medium_hard', 'hard'], required: true },
  min_mm: { type: Number, required: true },
  max_mm: { type: Number, required: true },
}, { _id: false });

const speedTierSchema = new mongoose.Schema({
  gauge_min: { type: Number, required: true },
  gauge_max: { type: Number, required: true },
  base_time_hrs_per_ton: { type: Number, required: true },
}, { _id: false });

const machineSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['slitter', 'shear', 'ctl'], required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  width_min_mm: { type: Number, required: true },
  width_max_mm: { type: Number, required: true },
  thickness_ranges: [thicknessRangeSchema],
  speed_tiers: [speedTierSchema],
  cut_baseline: { type: Number, default: 2 },
  small_cut_mm: { type: Number, default: 17 },
  small_cut_factor: { type: Number, default: 1.3 },
  setup_change_hrs: { type: Number, default: 1.5 },
  notes: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Machine', machineSchema);
