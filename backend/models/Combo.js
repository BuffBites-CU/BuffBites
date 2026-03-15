const mongoose = require('mongoose');

const comboSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  user_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dishes:      [String],
  tags:        [String],
  upvotes:     { type: Number, default: 0 },
  downvotes:   { type: Number, default: 0 },
  description: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Combo', comboSchema);