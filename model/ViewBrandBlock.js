const mongoose = require("mongoose");
const ViewBrandBlockSchema = new mongoose.Schema(
  {
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BrandBlock",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);
const ViewBrandBlock = mongoose.model("ViewBrandBlock", ViewBrandBlockSchema);
module.exports = ViewBrandBlock;
