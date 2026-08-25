const express = require("express");
const { syncSubscriptionInfo } = require("../controller/subscriptionSyncController");
const firebaseAuth = require("../middleware/firebaseAuth"); // assuming firebase auth is used for users

const router = express.Router();

router.post("/sync", firebaseAuth("user"), syncSubscriptionInfo);

module.exports = router;
