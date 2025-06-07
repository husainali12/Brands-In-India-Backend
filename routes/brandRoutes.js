const express = require("express");
const {
  uploadLogo,
  confirmAndShift,
  getAllBlocks,
  verifyPurchase,
} = require("../controller/brandController");
const firebaseAuth = require("../middleware/firebaseAuth");
const router = express.Router();

router.post("/upload-logo", firebaseAuth("any"), uploadLogo);
router.post("/confirm-placement", firebaseAuth("user"), confirmAndShift);
router.post("/verify-purchase", verifyPurchase);
router.get("/blocks", getAllBlocks);

module.exports = router;
