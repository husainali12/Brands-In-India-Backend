const express = require("express");
const router = express.Router();
const { getALlBrandListForExport } = require("../controller/exportController");

router.get("/extract-the-list", getALlBrandListForExport);

module.exports = router;
