const express = require("express");
const {
  generateToken,
  loginUser,
  registerUser,
  forgotPassword,
  getUserbyId,
  getUserByFirebaseUid,
  editUserInfo,
  uploadProfilePhoto,
  getUsers,
  blockUser,
  unblockUser,
  googleSignIn,
  phoneLogin,
  // deleteUser,
  // verifyUser,
  // unverifyUser,
  // activateUser,
  // deactivateUser,
} = require("../controller/authController");
const validate = require("../middleware/validate");
const firebaseAuth = require("../middleware/firebaseAuth");
const verifyToken = require("../validations/auth.validation");
const register = require("../validations/auth.validation");
const router = express.Router();
router.post("/token", validate(verifyToken), generateToken);

router.post("/login", firebaseAuth("any"), loginUser);
router.post("/google-signin", firebaseAuth("user"), googleSignIn);
router.post("/phone-login", firebaseAuth("user"), phoneLogin);
router.post(
  "/register",
  firebaseAuth("user"),
  validate(register),
  registerUser,
);

router.post(
  "/admin-register",
  firebaseAuth("admin"),
  validate(register),
  registerUser,
);
router.patch("/editUserInfo/:id", firebaseAuth("any"), editUserInfo);
router.post("/uploadProfilePhoto", firebaseAuth("any"), uploadProfilePhoto);
router.post("/forgot-password", firebaseAuth("any"), forgotPassword);
router.get("/me", firebaseAuth("any"), getUserbyId);
router.get("/users", firebaseAuth("admin"), getUsers);
router.get(
  "/by-firebase-uid/:firebaseUid",
  firebaseAuth("any"),
  getUserByFirebaseUid,
);
router.patch("/block-user/:id", firebaseAuth("admin"), blockUser);
router.patch("/unblock-user/:id", firebaseAuth("admin"), unblockUser);
// router.patch("/delete-user/:id", firebaseAuth("admin"), deleteUser);
// router.patch("/verify-user/:id", firebaseAuth("admin"), verifyUser);
// router.patch("/unverify-user/:id", firebaseAuth("admin"), unverifyUser);
// router.patch("/activate-user/:id", firebaseAuth("admin"), activateUser);
// router.patch("/deactivate-user/:id", firebaseAuth("admin"), deactivateUser);

module.exports = router;
