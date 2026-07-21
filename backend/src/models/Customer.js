const mongoose = require('mongoose');

const preferredSizeSchema = new mongoose.Schema({
  item_type: { type: String, enum: ['coil', 'sheet'], default: 'coil' },
  width_mm: { type: Number }, // blank = any width accepted
  thickness_mm: { type: Number }, // gauge (coil) or thickness (sheet); blank = any gauge accepted
  length_mm: { type: Number }, // sheet only; blank = any length accepted
  hardness: { type: String, enum: ['soft', 'semi_soft', 'medium', 'medium_hard', 'hard'] }, // legacy, kept for old data; no longer shown/required in the size-matching UI
  notes: { type: String },
}, { _id: false });

// Directional tolerance: value + direction (both = ±, plus = over only, minus = under only)
const toleranceSchema = new mongoose.Schema({
  value_mm: { type: Number, default: 0 },
  direction: { type: String, enum: ['both', 'plus', 'minus'], default: 'both' },
}, { _id: false });

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  contact: { type: String, trim: true },
  phone: { type: String, trim: true },
  address: { type: String, trim: true },
  preferred_sizes: [preferredSizeSchema],
  // Per-party default tolerances, prefilled onto new orders (SRD values as fallback).
  default_tolerances: {
    width: { type: toleranceSchema, default: () => ({ value_mm: 0.2, direction: 'both' }) },
    length: { type: toleranceSchema, default: () => ({ value_mm: 0.5, direction: 'both' }) },
    gauge: { type: toleranceSchema, default: () => ({ value_mm: 0.1, direction: 'minus' }) },
  },
  notes: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Customer', customerSchema);
