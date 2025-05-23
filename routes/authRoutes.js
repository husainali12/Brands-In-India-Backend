const express = require("express");
const {
  generateToken,
  loginUser,
  registerUser,
  forgotPassword,
  getUserbyId
} = require("../controller/authController");
const validate = require("../middleware/validate");
const firebaseAuth = require("../middleware/firebaseAuth");
const verifyToken = require("../validations/auth.validation");
const register = require("../validations/auth.validation");
const router = express.Router();
router.post("/token", validate(verifyToken), generateToken);

router.post("/login", firebaseAuth("any"), loginUser);

router.post(
  "/register",
  firebaseAuth("user"),
  validate(register),
  registerUser
);

router.post(
  "/admin-register",
  firebaseAuth("admin"),
  validate(register),
  registerUser
);

router.post("/forgot-password", firebaseAuth("any"), forgotPassword);
router.get("/me", firebaseAuth("any"), getUserbyId);
module.exports = router;
