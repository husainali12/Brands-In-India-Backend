const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  gridSpaces: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GridSpace",
      required: true,
    },
  ],
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    required: true,
    default: "INR",
  },
  paymentId: {
    type: String,
    required: false,
  },
  orderId: {
    type: String,
    required: true,
  },
  paymentStatus: {
    type: String,
    enum: ["initiated", "processing", "success", "failed"],
    default: "initiated",
  },
  receipt: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Transaction", TransactionSchema);
