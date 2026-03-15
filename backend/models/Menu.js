const mongoose = require('mongoose');

const dishSchema = new mongoose.Schema({
  name:            { type: String, required: true },
  description:     { type: String },
  serving_size:    { type: String },
  calories:        { type: Number },
  ingredients:     { type: String },
  allergens:       [String],
  dietary_labels:  [String],
  is_vegan:        { type: Boolean, default: false },
  is_vegetarian:   { type: Boolean, default: false },
  nutrition: {
    calories:        Number,
    fat_g:           Number,
    saturated_fat_g: Number,
    sodium_mg:       Number,
    carbohydrates_g: Number,
    fiber_g:         Number,
    protein_g:       Number,
  }
});

const menuSchema = new mongoose.Schema({
  dining_location: { type: String, required: true },
  date:            { type: String, required: true },
  day_of_week:     { type: String },
  categories:      { type: Map, of: [dishSchema] },
}, { timestamps: true });

module.exports = mongoose.model('Menu', menuSchema);