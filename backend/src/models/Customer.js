const mongoose = require('mongoose');

const preferredSizeSchema = new mongoose.Schema({
  width_mm: { type: Number },
  thickness_mm: { type: Number },
  hardness: { type: String, enum: ['soft', 'semi_soft', 'medium', 'medium_hard', 'hard'] },
  notes: { type: String },
}, { _id: false });

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  contact: { type: String, trim: true },
  phone: { type: String, trim: true },
  address: { type: String, trim: true },
  preferred_sizes: [preferredSizeSchema],
  notes: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Customer', customerSchema);
