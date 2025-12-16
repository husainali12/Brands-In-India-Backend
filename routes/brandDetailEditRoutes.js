const express = require("express");
const {
  updateBrandDetailsById,
  uploadBrandImages,
  uploadProductImages,
} = require("../controller/brandDetailEditController");
const firebaseAuth = require("../middleware/firebaseAuth");
const router = express.Router();
router.post("/brandImages", firebaseAuth("any"), uploadBrandImages);
router.post("/brandProductImages", firebaseAuth("any"), uploadProductImages);
router.patch("/brandDetails/:id", firebaseAuth("any"), updateBrandDetailsById);
module.exports = router;
