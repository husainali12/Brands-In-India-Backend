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
} = require("../controller/brandController");
const firebaseAuth = require("../middleware/firebaseAuth");
const router = express.Router();

router.post("/upload-logo", firebaseAuth("any"), uploadLogo);
router.post("/confirm-placement", firebaseAuth("user"), confirmAndShift);
router.post("/verify-purchase", verifyPurchase);
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
