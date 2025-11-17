const express = require("express");
const {
  uploadLogo,
  confirmAndShift,
  getAllBlocks,
  verifyPurchase,
  createCategory,
  getCategories,
  getBlocksByOwner,
  recordBrandBlockClick,
  getBrandBlockClickAnalytics,
  getTotalClicksAggregation,
  updateBlocksById,
  getTimeSeriesAnalytics,
  getSuccessfulCreatedAt,
  updateBlockWithCoords,
  sendProposal,
  verifyPaymentLink,
  createSubscription,
  verifySubscriptionPayment,
  handleRazorpayWebhook,
} = require("../controller/brandController");
const firebaseAuth = require("../middleware/firebaseAuth");
const router = express.Router();
router.post("/webhook", express.raw({ type: "*/*" }), handleRazorpayWebhook);
router.post("/upload-logo", firebaseAuth("any"), uploadLogo);
router.post("/confirm-placement", firebaseAuth("user"), confirmAndShift);
router.post("/send-proposal", firebaseAuth("user"), sendProposal);
router.post("/verify-payment-link", firebaseAuth("user"), verifyPaymentLink);
router.post(
  "/update-block/:blockId",
  firebaseAuth("user"),
  updateBlockWithCoords
);
router.post("/verify-purchase", firebaseAuth("user"), verifyPurchase);
router.post("/create-subscription", firebaseAuth("user"), createSubscription);
router.post("/verify-subscription-payment/:id", verifySubscriptionPayment);
router.get("/blocks", getAllBlocks);
router.post("/category", createCategory);
router.get("/category", getCategories);
router.get("/owner/:ownerId", firebaseAuth("any"), getBlocksByOwner);
router.patch("/brand/:id", firebaseAuth("any"), updateBlocksById);
router.post("/blocks/:id/click", firebaseAuth("any"), recordBrandBlockClick);
router.get(
  "/blocks/:id/analytics",
  firebaseAuth("any"),
  getBrandBlockClickAnalytics
);
router.get(
  "/analytics/global-clicks",
  firebaseAuth("admin"),
  getTotalClicksAggregation
);
router.get(
  "/analytics/time-series",
  // firebaseAuth("admin"),
  getTimeSeriesAnalytics
);

router.get(
  "/analytics/successful-created-at",
  // firebaseAuth("admin"),
  getSuccessfulCreatedAt
);

module.exports = router;
