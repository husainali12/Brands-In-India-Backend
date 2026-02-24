const express = require("express");
const { createWhoViewedBrandBlock } = require("../controller/ViewController");
const firebaseAuth = require("../middleware/firebaseAuth");
const router = express.Router();

router.post("/whoViewMyBrand", firebaseAuth("any"), createWhoViewedBrandBlock);

module.exports = router;
