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
  // Manually-logged, after-the-fact production records may not tie to a specific order.
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  line_item_id: { type: mongoose.Schema.Types.ObjectId },
  // Machine / inventory are optional so a job can be logged even when the piece used isn't tracked.
  machine: { type: mongoose.Schema.Types.ObjectId, ref: 'Machine' },
  inventory_item_id: { type: mongoose.Schema.Types.ObjectId },
  inventory_type: { type: String, enum: ['coil', 'sheet'] },
  material_weight_used_kg: { type: Number, default: 0 },
  output_kg: { type: Number, default: 0 }, // good product this job yields for the order (credited to the line item when completed)
  restocked_coil_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Coil' }, // leftover strip restocked as a new coil, if any (used to reverse on order cancel)
  cut_pieces: [cutPieceSchema],
  num_cuts: { type: Number, default: 2 },
  wastage_kg: { type: Number, default: 0 },
  wastage_pct: { type: Number, default: 0 },
  scrap_kg: { type: Number, default: 0 },
  estimated_time_hrs: { type: Number },
  actual_start: { type: Date },   // set by the "Start" button or manual entry — real time work began
  actual_end: { type: Date },     // set by the "End" button or manual entry — real time work finished
  manual_entry: { type: Boolean, default: false }, // logged by hand after the fact vs created by the optimizer
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
