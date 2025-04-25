const express = require("express");
const {
  createBidding,
  placeBid,
  verifyBidPayment,
  getActiveBiddings,
  getBiddingDetails,
  getUserBids,
  finalizeBidding
} = require("../controller/biddingController");
const firebaseAuth = require("../middleware/firebaseAuth");
const router = express.Router();

router.get("/active", firebaseAuth("any"), getActiveBiddings);
router.get("/details/:biddingId", firebaseAuth("any"), getBiddingDetails);

router.post("/create", firebaseAuth("admin"), createBidding);
router.post("/place-bid", firebaseAuth("any"), placeBid);
router.post("/verify-bid-payment", firebaseAuth("any"), verifyBidPayment);
router.get("/my-bids", firebaseAuth("any"), getUserBids);

router.post("/finalize/:biddingId", firebaseAuth("admin"), finalizeBidding);

module.exports = router;
