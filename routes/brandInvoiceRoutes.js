const express = require("express");
const {
  syncBrandInvoice,
  getAllBrandInvoice,
  updateBrandInvoice,
} = require("../controller/brandInvoiceCotroller");
const router = express.Router();

router.get("/sync-brand-invoice", syncBrandInvoice, getAllBrandInvoice);

router.post("/updateBrandInvoice/:id", updateBrandInvoice);

module.exports = router;
