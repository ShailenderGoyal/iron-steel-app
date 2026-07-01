const mongoose = require('mongoose');

const movementSchema = new mongoose.Schema({
  type: { type: String, enum: ['purchase', 'job_deduction', 'scrap', 'adjustment'], required: true },
  weight_kg: { type: Number, required: true },
  reference: { type: String }, // order id or job id
  notes: { type: String },
  date: { type: Date, default: Date.now },
}, { _id: false });

// Shared fields
const baseInventory = {
  hardness: { type: String, enum: ['soft', 'semi_soft', 'medium', 'medium_hard', 'hard'], required: true },
  grade: { type: String, enum: ['grade_1', 'grade_2'], default: 'grade_1' },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  purchase_date: { type: Date, default: Date.now },
  purchase_price_per_kg: { type: Number },
  weight_kg: { type: Number, required: true },
  remaining_weight_kg: { type: Number, required: true },
  movements: [movementSchema],
  notes: { type: String },
  isActive: { type: Boolean, default: true },
};

const coilSchema = new mongoose.Schema({
  ...baseInventory,
  item_type: { type: String, default: 'coil', immutable: true },
  od_mm: { type: Number, required: true },
  id_mm: { type: Number, required: true },
  width_mm: { type: Number, required: true },
  gauge_mm: { type: Number, required: true },
}, { timestamps: true });

const sheetSchema = new mongoose.Schema({
  ...baseInventory,
  item_type: { type: String, default: 'sheet', immutable: true },
  length_mm: { type: Number, required: true },
  width_mm: { type: Number, required: true },
  thickness_mm: { type: Number, required: true },
  format_preset: { type: String, default: 'custom' },
  quantity: { type: Number, required: true, default: 1 },
  weight_per_sheet_kg: { type: Number },
}, { timestamps: true });

const Coil = mongoose.model('Coil', coilSchema);
const Sheet = mongoose.model('Sheet', sheetSchema);

module.exports = { Coil, Sheet };
