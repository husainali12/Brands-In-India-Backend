const Razorpay = require("razorpay");
const config = require("../config/config");
const SubscriptionDetails = require("../model/SubscriptionDetails");
const BrandBlock = require("../model/BrandBlock");
const catchAsync = require("../utils/catchAsync");

const razorpay = new Razorpay({
  key_id: config.razorpay.keyId,
  key_secret: config.razorpay.keySecret,
});

/**
 * Fetch and sync subscription info from Razorpay to local DB
 * Intended to be called when the user logs in and visits their dashboard/profile
 */
const syncSubscriptionInfo = catchAsync(async (req, res) => {
  const { subscriptionId } = req.body;
  const userId = req.user._id;
  console.log(`[SyncSubscription] Received request for user ${userId} with subscriptionId:`, subscriptionId);

  if (!subscriptionId || subscriptionId === "" || subscriptionId === "undefined" || subscriptionId === "null") {
    return res.status(400).json({
      success: false,
      message: "A valid Razorpay subscriptionId is required",
    });
  }

  try {
    console.log(`[SyncSubscription] Fetching from Razorpay: ${subscriptionId}`);
    // 1. Fetch real-time status from Razorpay
    const razorpaySubscription = await razorpay.subscriptions.fetch(subscriptionId);
    if (!razorpaySubscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found in Razorpay",
      });
    }

    // 2. Map fields
    const rzpStatus = razorpaySubscription.status; // e.g., active, halted, cancelled, pending
    let autoPayEnabled = true;
    let paymentFailedAt = null;
    let cancelledAt = null;

    if (rzpStatus === "cancelled") {
      autoPayEnabled = false;
      cancelledAt = razorpaySubscription.ended_at 
        ? new Date(razorpaySubscription.ended_at * 1000) 
        : new Date();
    }

    if (rzpStatus === "halted") {
      paymentFailedAt = new Date();
    }

    const currentPeriodStart = razorpaySubscription.current_start 
      ? new Date(razorpaySubscription.current_start * 1000) 
      : null;
    const currentPeriodEnd = razorpaySubscription.current_end 
      ? new Date(razorpaySubscription.current_end * 1000) 
      : null;

    // Optional: link with BrandBlock if we can find it
    const block = await BrandBlock.findOne({ subscriptionId });

    // 3. Upsert into local SubscriptionDetails schema
    const updatedDetails = await SubscriptionDetails.findOneAndUpdate(
      { razorpaySubscriptionId: subscriptionId },
      {
        userId,
        brandBlockId: block ? block._id : null,
        razorpayCustomerId: razorpaySubscription.customer_id,
        planId: razorpaySubscription.plan_id,
        status: rzpStatus,
        autoPayEnabled,
        currentPeriodStart,
        currentPeriodEnd,
        ...(cancelledAt && { cancelledAt }),
        ...(paymentFailedAt && { paymentFailedAt }),
      },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      success: true,
      message: "Subscription synchronized successfully",
      data: updatedDetails,
    });
  } catch (error) {
    console.error("Error syncing subscription info:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to sync subscription information",
      error: error.message,
    });
  }
});

module.exports = {
  syncSubscriptionInfo,
};
