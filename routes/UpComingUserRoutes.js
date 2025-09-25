const express = require("express");
const {
  createUpComingUser,
  getAllUpComingUsers,
} = require("../controller/UpComingUserController");
const firebaseAuth = require("../middleware/firebaseAuth");
const router = express.Router();
router.post("/create-upcoming-user", firebaseAuth("any"), createUpComingUser);
router.get("/all-upcoming-users", firebaseAuth("admin"), getAllUpComingUsers);
module.exports = router;
