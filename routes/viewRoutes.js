const express = require("express");
const {
  createWhoViewedBrandBlock,
  recordBrandBlockAction,
} = require("../controller/ViewController");
const firebaseAuth = require("../middleware/firebaseAuth");
const router = express.Router();

router.post("/whoViewMyBrand", firebaseAuth("any"), createWhoViewedBrandBlock);
router.post("/brandAction", firebaseAuth("any"), recordBrandBlockAction);

module.exports = router;
