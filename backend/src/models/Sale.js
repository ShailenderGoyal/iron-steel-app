const mongoose = require('mongoose');

// One line of a sale: a weight taken from one stock item. The size fields are a snapshot taken at
// sale time, so the record stays correct even if the stock item is later edited or removed.
const saleItemSchema = new mongoose.Schema({
  item_type: { type: String, enum: ['coil', 'sheet'], required: true },
  item: { type: mongoose.Schema.Types.ObjectId, required: true }, // Coil or Sheet _id, per item_type
  width_mm: { type: Number },
  thickness_mm: { type: Number }, // gauge (coil) or thickness (sheet)
  length_mm: { type: Number }, // sheets only
  hardness: { type: String },
  grade: { type: String },
  rust_level: { type: String },
  weight_kg: { type: Number, required: true },
  pieces: { type: Number }, // sheets only, optional
  // Coils only: the coil was slit to a narrower width for the party (width_mm above is then the
  // width they bought). The strip left over is either restocked as a new coil or written off as scrap.
  source_width_mm: { type: Number }, // width of the coil before cutting
  strips: { type: Number }, // how many strips of width_mm were cut
  leftover_width_mm: { type: Number },
  leftover_weight_kg: { type: Number },
  leftover_coil: { type: mongoose.Schema.Types.ObjectId }, // the new Coil, when the leftover was restocked
  leftover_scrapped_kg: { type: Number }, // leftover that did NOT go back to stock (scrap / written off)
}, { _id: true });

const saleSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  sale_date: { type: Date, default: Date.now },
  bill_no: { type: String, trim: true },
  vehicle_no: { type: String, trim: true },
  notes: { type: String },
  items: { type: [saleItemSchema], validate: v => v.length > 0 },
  total_weight_kg: { type: Number, required: true },
  status: { type: String, enum: ['active', 'cancelled'], default: 'active' },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelled_at: { type: Date },
  cancelled_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

saleSchema.index({ customer: 1, sale_date: -1 });

module.exports = mongoose.model('Sale', saleSchema);
