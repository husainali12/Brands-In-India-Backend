const express = require("express");
const {
  updateBrandDetailsById,
} = require("../controller/brandDetailEditController");
const firebaseAuth = require("../middleware/firebaseAuth");
const router = express.Router();
router.patch("/brandDetails/:id", firebaseAuth("any"), updateBrandDetailsById);
module.exports = router;
