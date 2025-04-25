const mongoose = require("mongoose");

const BidSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected"],
    default: "pending",
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Transaction",
  },
});

const BiddingSchema = new mongoose.Schema({
  gridSpace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "GridSpace",
    required: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  minimumBid: {
    type: Number,
    required: true,
    default: 0,
  },
  status: {
    type: String,
    enum: ["active", "completed"],
    default: "active",
  },
  bids: [BidSchema],
  winningBid: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Transaction",
    default: null,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

BiddingSchema.methods.isActive = function () {
  return this.status === "active" && Date.now() < this.endDate.getTime();
};

BiddingSchema.methods.getHighestBid = function () {
  if (!this.bids || this.bids.length === 0) {
    return this.minimumBid;
  }
  return Math.max(...this.bids.map((bid) => bid.amount));
};

BiddingSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Bidding", BiddingSchema);
