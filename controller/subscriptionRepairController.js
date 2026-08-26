const Razorpay = require("razorpay");
const config = require("../config/config");
const BrandBlock = require("../model/BrandBlock");
const SubscriptionHistory = require("../model/subscriptionHistory");
const catchAsync = require("../utils/catchAsync");

const razorpay = new Razorpay({
  key_id: config.razorpay.keyId,
  key_secret: config.razorpay.keySecret,
});

/**
 * Statuses where we must cancel the old Razorpay subscription
 * before creating a new one (it's still "live" in Razorpay's eyes).
 */
const STATUSES_REQUIRING_CANCEL = new Set([
  "created",
  "authenticated",
  "pending",
]);

/**
 * Map an old subscription status → a human-readable repair reason
 * stored in SubscriptionHistory.
 */
const statusToReason = (status) => {
  switch (status) {
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    case "halted":
      return "halted";
    case "paused":
      return "paused";
    case "payment_failed":
      return "payment_failed";
    case "created":
    case "authenticated":
    case "pending":
      return "pending";
    default:
      return "manual_repair";
  }
};

const repairSubscription = catchAsync(async (req, res) => {
  const { brandBlockId } = req.body;
  const userId = req.user._id;

  if (!brandBlockId) {
    return res.status(400).json({
      success: false,
      message: "brandBlockId is required",
    });
  }

  // ── 1. Find and authorise the block ─────────────────────────────────────
  const block = await BrandBlock.findById(brandBlockId);

  if (!block) {
    return res.status(404).json({
      success: false,
      message: "Brand block not found",
    });
  }

  if (block.owner.toString() !== userId.toString()) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to repair this subscription",
    });
  }

  const oldSubscriptionId = block.subscriptionId;

  
  let planIdToUse = block.planId;

  if (!planIdToUse) {
    // Fallback: create a new plan dynamically
    console.log(
      `[RepairSubscription] No planId on block ${brandBlockId}. Creating a new plan as fallback.`
    );

    const planType = block.subsscriptionPlantType || "monthly";
    const baseMonthlyPrice = 600;
    const gst = 0.18;
    const monthlyWithGST = baseMonthlyPrice * (1 + gst); // 708
    const yearlyWithGST = monthlyWithGST * 12;

    const amount =
      planType === "yearly"
        ? Math.round(yearlyWithGST * 100)
        : Math.round(monthlyWithGST * 100);

    const period = planType === "yearly" ? "yearly" : "monthly";

    const newPlan = await razorpay.plans.create({
      period,
      interval: 1,
      item: {
        name: `${block.brandName} ${period.charAt(0).toUpperCase() + period.slice(1)} Subscription`,
        amount,
        currency: "INR",
      },
    });

    planIdToUse = newPlan.id;
    // Persist so future repairs don't need to recreate
    block.planId = planIdToUse;
  }

  // ── 3. Handle the old Razorpay subscription ──────────────────────────────
  let oldRzpStatus = "unknown";
  let cancelledByUs = false;
  let razorpayEndedAt = null;

  if (oldSubscriptionId && oldSubscriptionId.startsWith("sub_")) {
    try {
      const oldSub = await razorpay.subscriptions.fetch(oldSubscriptionId);
      oldRzpStatus = oldSub.status || "unknown";

      if (oldSub.ended_at) {
        razorpayEndedAt = new Date(oldSub.ended_at * 1000);
      }

      // ── 2a. Handle Instant Resume for Paused Subscriptions ──────────────────
      if (oldRzpStatus === "paused") {
        try {
          await razorpay.subscriptions.resume(oldSubscriptionId, {
            resume_at: "now",
          });

          // Update local block state
          block.subscriptionStatus = "active";
          await block.save();

          return res.status(200).json({
            success: true,
            resumed: true,
            message: "Subscription resumed successfully.",
            subscriptionId: oldSubscriptionId
          });
        } catch (resumeErr) {
          console.error("Failed to resume paused subscription:", resumeErr);
          return res.status(500).json({
            success: false,
            message: "Failed to resume subscription. Please try again.",
          });
        }
      }

      // Cancel only if the sub is still "live" in Razorpay
      if (STATUSES_REQUIRING_CANCEL.has(oldRzpStatus)) {
        console.log(
          `[RepairSubscription] Cancelling old sub ${oldSubscriptionId} (status: ${oldRzpStatus})`
        );
        await razorpay.subscriptions.cancel(oldSubscriptionId, {
          cancel_at_cycle_end: false,
        });
        cancelledByUs = true;
      } else {
        console.log(
          `[RepairSubscription] Old sub ${oldSubscriptionId} already terminal (status: ${oldRzpStatus}). Skipping cancel.`
        );
      }
    } catch (rzpError) {
      // If Razorpay can't find the old sub (e.g. test mode mismatch), log and continue
      console.warn(
        `[RepairSubscription] Could not fetch/cancel old subscription ${oldSubscriptionId}:`,
        rzpError.message
      );
    }
  } else {
    console.log(
      `[RepairSubscription] Block ${brandBlockId} has no valid old subscriptionId. Skipping fetch/cancel.`
    );
  }

  const historyEntry = await SubscriptionHistory.findOneAndUpdate(
    {
      oldSubscriptionId: oldSubscriptionId || `no-sub-${brandBlockId}`,
      brandBlockId,
    },
    {
      userId,
      brandBlockId,
      oldSubscriptionId: oldSubscriptionId || `no-sub-${brandBlockId}`,
      oldStatus: oldRzpStatus,
      planId: planIdToUse,
      reason: statusToReason(oldRzpStatus),
      cancelledByUs,
      ...(razorpayEndedAt && { razorpayEndedAt }),
      replacedAt: new Date(),
    },
    { new: true, upsert: true }
  );

  // ── 5. Create a NEW Razorpay subscription ───────────────────────────────
  const totalCount = block.totalBillingCycles || 240; // default 20 years of monthly

  console.log(
    `[RepairSubscription] Creating new subscription with plan ${planIdToUse}`
  );

  const newSub = await razorpay.subscriptions.create({
    plan_id: planIdToUse,
    total_count: totalCount,
    customer_notify: 1,
    notes: {
      blockId: block._id.toString(),
      repaired: "true",
      previousSubscriptionId: oldSubscriptionId || "none",
    },
  });

  // ── 6. Link new sub ID back to SubscriptionHistory & BrandBlock ─────────
  historyEntry.newSubscriptionId = newSub.id;
  await historyEntry.save();

  block.subscriptionId = newSub.id;
  block.subscriptionStatus = newSub.status; // typically "created" at this point
  block.planId = planIdToUse;
  await block.save();

  console.log(
    `[RepairSubscription] Done. Block ${brandBlockId} now linked to new sub ${newSub.id}`
  );

  // ── 7. Return data for Razorpay Checkout ────────────────────────────────
  return res.status(200).json({
    success: true,
    message: "New subscription created. Open Razorpay Checkout to authorize.",
    newSubscriptionId: newSub.id,
    razorpayKeyId: config.razorpay.keyId,
    planId: planIdToUse,
    // historyId for debugging — frontend can ignore
    historyId: historyEntry._id,
  });
});

module.exports = { repairSubscription };
