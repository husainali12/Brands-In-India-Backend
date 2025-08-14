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

module.exports = router;
