const express = require("express");
const {
  createUpComingUser,
  getAllUpComingUsers,
} = require("../controller/UpComingUserController");
const router = express.Router();
router.post("/create-upcoming-user", createUpComingUser);
router.get("/all-upcoming-users", getAllUpComingUsers);
module.exports = router;
