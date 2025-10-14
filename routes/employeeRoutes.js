const express = require("express");
const router = express.Router();
const { getAllEmployees } = require("../controller/employeeController");
const firebaseAuth = require("../middleware/firebaseAuth");
router.get("/getAllEmployees", firebaseAuth("admin"), getAllEmployees);
module.exports = router;
