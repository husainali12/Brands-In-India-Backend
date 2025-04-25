const mongoose = require("mongoose");

const GridLayoutSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
  },
  rows: {
    type: Number,
    required: true,
  },
  columns: {
    type: Number,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  spaces: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GridSpace",
    },
  ],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

GridLayoutSchema.index(
  { name: 1, createdBy: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model("GridLayout", GridLayoutSchema);
