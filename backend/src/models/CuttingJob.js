const mongoose = require('mongoose');

const cutPieceSchema = new mongoose.Schema({
  width_mm: { type: Number, required: true },
  length_mm: { type: Number },
  count: { type: Number, default: 1 },
  for_order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  for_line_item: { type: mongoose.Schema.Types.ObjectId },
}, { _id: false });

const cuttingJobSchema = new mongoose.Schema({
  job_number: { type: String, unique: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  line_item_id: { type: mongoose.Schema.Types.ObjectId },
  machine: { type: mongoose.Schema.Types.ObjectId, ref: 'Machine', required: true },
  inventory_item_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  inventory_type: { type: String, enum: ['coil', 'sheet'], required: true },
  material_weight_used_kg: { type: Number, required: true },
  cut_pieces: [cutPieceSchema],
  num_cuts: { type: Number, default: 2 },
  wastage_kg: { type: Number, default: 0 },
  wastage_pct: { type: Number, default: 0 },
  scrap_kg: { type: Number, default: 0 },
  estimated_time_hrs: { type: Number },
  status: { type: String, enum: ['planned', 'in_progress', 'completed', 'cancelled'], default: 'planned' },
  scheduled_date: { type: Date },
  completed_date: { type: Date },
  notes: { type: String },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

cuttingJobSchema.pre('save', async function (next) {
  if (!this.job_number) {
    const count = await mongoose.model('CuttingJob').countDocuments();
    this.job_number = `JOB-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('CuttingJob', cuttingJobSchema);
