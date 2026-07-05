const mongoose = require('mongoose');

const breakTimeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  duration_min: { type: Number, required: true },
  enabled: { type: Boolean, default: true },
}, { _id: false });

const settingsSchema = new mongoose.Schema({
  singleton_key: { type: String, default: 'app_settings', unique: true },
  default_unit: { type: String, enum: ['mm', 'cm', 'inches', 'feet', 'meters'], default: 'mm' },
  break_times: {
    type: [breakTimeSchema],
    default: [
      { name: 'Morning Break', duration_min: 15, enabled: true },
      { name: 'Lunch', duration_min: 45, enabled: true },
      { name: 'Tea Break', duration_min: 15, enabled: true },
      { name: 'Dinner Break', duration_min: 30, enabled: true },
    ],
  },
  working_hours_per_day: { type: Number, default: 10 },
  qty_tolerance_pct: { type: Number, default: 20 },
  // Slitting leftover narrower than this is scrap; wider is restocked as a coil.
  min_reusable_coil_width_mm: { type: Number, default: 25 },
  // Inventory items with this % or less of their weight remaining are flagged low-stock on the dashboard.
  low_stock_threshold_pct: { type: Number, default: 20 },
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
