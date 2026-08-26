const mongoose = require("mongoose");
const subscriptionHistorySchema = new mongoose.Schema(
  {
    brandBlockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BrandBlock",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    oldSubscriptionId: {
      type: String,
      required: true,
      index: true,
    },
    oldStatus: {
      type: String,
      enum: [
        "created",
        "authenticated",
        "active",
        "pending",
        "payment_pending",
        "payment_failed",
        "halted",
        "cancelled",
        "expired",
        "completed",
        "unknown",
      ],
      default: "unknown",
    },
    planId: {
      type: String, 
    },
    reason: {
      type: String,
      enum: [
        "cancelled",      
        "expired",        
        "halted",         
        "payment_failed", 
        "pending",        
        "manual_repair",  
      ],
      default: "manual_repair",
    },
    cancelledByUs: {
      type: Boolean,
      default: false,
    },

    razorpayEndedAt: {
      type: Date, 
    },
    newSubscriptionId: {
      type: String, 
      index: true,
    },

    replacedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SubscriptionHistory", subscriptionHistorySchema);
