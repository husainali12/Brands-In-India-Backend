const express = require("express");
const router = express.Router();
const { getTotalBrandsCount } = require("../controller/analytics");

// GET /api/analytics/total-brands
// Returns the total number of brands with paymentStatus === "success"
router.get("/total-brands", getTotalBrandsCount);

module.exports = router;
