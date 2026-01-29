const express = require("express");
const { getAllOrders } = require("../controller/panelController");
const firebaseAuth = require("../middleware/firebaseAuth");
const router = express.Router();
router.get("/get-all-orders", getAllOrders);
module.exports = router;
