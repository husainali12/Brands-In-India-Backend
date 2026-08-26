const express = require("express");
const { syncSubscriptionInfo } = require("../controller/subscriptionSyncController");
const { repairSubscription } = require("../controller/subscriptionRepairController");
const firebaseAuth = require("../middleware/firebaseAuth");

const router = express.Router();

router.post("/sync", firebaseAuth("user"), syncSubscriptionInfo);

router.post("/repair", firebaseAuth("user"), repairSubscription);

module.exports = router;
