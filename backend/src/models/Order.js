const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  width_mm: { type: Number, required: true },
  length_mm: { type: Number },
  thickness_mm: { type: Number, required: true },
  hardness: { type: String, enum: ['soft', 'semi_soft', 'medium', 'medium_hard', 'hard'], required: true },
  qty_kg: { type: Number, required: true },
  qty_tolerance_pct: { type: Number, default: 20 }, // ±20% quantity band
  width_tolerance_mm: { type: Number, default: 0.2 },
  length_tolerance_mm: { type: Number, default: 0.5 },
  gauge_tolerance_mm: { type: Number, default: 0.1 },
  fulfilled_kg: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'in_production', 'fulfilled'], default: 'pending' },
}, { _id: true });

const orderSchema = new mongoose.Schema({
  order_number: { type: String, unique: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  date_created: { type: Date, default: Date.now },
  deadline: { type: Date },
  status: { type: String, enum: ['pending', 'in_production', 'ready', 'dispatched'], default: 'pending' },
  priority: { type: String, enum: ['high', 'normal'], default: 'normal' },
  line_items: [lineItemSchema],
  notes: { type: String },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Auto-generate order number
orderSchema.pre('save', async function (next) {
  if (!this.order_number) {
    const count = await mongoose.model('Order').countDocuments();
    this.order_number = `ORD-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
