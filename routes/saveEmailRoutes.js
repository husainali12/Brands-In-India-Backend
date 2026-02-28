const express = require("express");
const { saveEmail } = require("../controller/saveEmail");
const firebaseAuth = require("../middleware/firebaseAuth");
const router = express.Router();
router.post("/save-email", firebaseAuth("user"), saveEmail);
module.exports = router;
