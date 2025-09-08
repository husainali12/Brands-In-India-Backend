const express = require("express");
const { getAllBlockReasons } = require("../controller/BlockReasonController");
const router = express.Router();
router.get("/getAllReasons", getAllBlockReasons);
module.exports = router;
