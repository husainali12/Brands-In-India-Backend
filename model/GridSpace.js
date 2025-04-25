const mongoose = require("mongoose");

const GridSpaceSchema = new mongoose.Schema({
  position: {
    x: {
      type: Number,
      required: true,
    },
    y: {
      type: Number,
      required: true,
    },
  },
  size: {
    width: {
      type: Number,
      required: true,
      default: 1,
    },
    height: {
      type: Number,
      required: true,
      default: 1,
    },
  },
  price: {
    type: Number,
  },
  status: {
    type: String,
    enum: ["available", "reserved", "purchased","bidding"],
    default: "available",
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  image: {
    type: String,
    default: null,
  },
  clickUrl: {
    type: String,
    default: null,
  },
  impressions: {
    type: Number,
    default: 0,
  },
  clicks: {
    type: Number,
    default: 0,
  },
  activeBidding: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Bidding",
    default: null,
  },
  reservationExpiresAt: {
    type: Date,
    default: null,
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

GridSpaceSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("GridSpace", GridSpaceSchema);
