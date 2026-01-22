const express = require("express");
const {
  syncSubscriptionInvoices,
  getInvoiceBySubscriptionId,
} = require("../controller/subscriptionInvoceController");
const { fetchSubscriptionInvoices } = require("../service/razorpayservice");
const router = express.Router();
router.post("/subscription/invoices/sync", syncSubscriptionInvoices);
router.get("/fetch/invoices", fetchSubscriptionInvoices);
router.get("/subscriptionInvoice/:subscriptionId", getInvoiceBySubscriptionId);
module.exports = router;
