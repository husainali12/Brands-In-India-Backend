const express = require("express");
const {
  syncSubscriptionInvoices,
  getInvoiceBySubscriptionId,
  getAllSubscriptionStatuses,
} = require("../controller/subscriptionInvoceController");
const { fetchSubscriptionInvoices } = require("../service/razorpayservice");
const router = express.Router();
router.post("/subscription/invoices/sync", syncSubscriptionInvoices);
router.get("/fetch/invoices", fetchSubscriptionInvoices);
router.get("/subscriptionInvoice/:subscriptionId", getInvoiceBySubscriptionId);
router.get("/subscription-statuses", getAllSubscriptionStatuses);
module.exports = router;
