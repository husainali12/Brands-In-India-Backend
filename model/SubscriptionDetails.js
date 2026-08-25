const mongoose = require("mongoose");

const subscriptionDetailsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    brandBlockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BrandBlock",
    },
    razorpaySubscriptionId: {
      type: String,
      required: true,
      unique: true,
    },
    razorpayCustomerId: {
      type: String,
    },
    planId: {
      type: String,
    },
    status: {
      type: String,
      enum: [
        "created",
        "authenticated",
        "active",
        "payment_pending",
        "payment_failed",
        "halted",
        "cancelled",
        "expired",
        "pending",
      ],
      default: "created",
    },
    autoPayEnabled: {
      type: Boolean,
      default: true,
    },
    currentPeriodStart: {
      type: Date,
    },
    currentPeriodEnd: {
      type: Date,
    },
    cancelledAt: {
      type: Date,
    },
    paymentFailedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SubscriptionDetails", subscriptionDetailsSchema);
