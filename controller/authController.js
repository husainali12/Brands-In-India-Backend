const admin = require("firebase-admin");
const authService = require("../service/authService");
const catchAsync = require("../utils/catchAsync");
const config = require("../config/config");
const fetch = require("node-fetch");
const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");

const createNewUserObject = (newUser, role = "user") => ({
  email: newUser.email,
  firebaseUid: newUser.uid,
  isEmailVerified: newUser.email_verified || false,
  firebaseSignInProvider: newUser.firebase?.sign_in_provider,
  role,
});

const loginUser = catchAsync(async (req, res) => {
  const user = req.user;

  res.status(200).json({
    status: true,
    data: user,
    message: "User logged in successfully",
  });
});

const registerUser = catchAsync(async (req, res) => {
  if (req.user) {
    return res.status(409).json({
      status: false,
      message: "User already exists",
      data: req.user,
    });
  }

  const userObj = {
    ...createNewUserObject(req.newUser, req.defaultRole),
    ...req.body,
  };

  const user = await authService.createUser(userObj);
  return res.status(user ? 201 : 500).json({
    status: !!user,
    message: user ? "User registered successfully" : "User registration failed",
    data: user,
  });
});

const generateToken = catchAsync(async (req, res) => {
  const token = await admin.auth().createCustomToken(req.body.uid);

  const response = await fetch(
    `https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyCustomToken?key=${config.firebase.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        returnSecureToken: true,
      }),
    }
  );

  if (!response.ok) {
    return res.status(502).json({
      status: false,
      message: "Failed to exchange custom token",
    });
  }

  const { idToken } = await response.json();

  res.status(200).json({
    status: true,
    message: "Token generated successfully",
    data: { customToken: token, idToken },
  });
});

const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      status: false,
      message: "Email is required",
    });
  }

  try {
    await admin.auth().getUserByEmail(email);
  } catch (error) {
    return res.status(404).json({
      status: false,
      message: "Email is not registered with us",
    });
  }

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${config.firebase.apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestType: "PASSWORD_RESET",
      email,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return res.status(500).json({
      status: false,
      message: data.error?.message || "Failed to send reset email",
    });
  }

  return res.status(200).json({
    status: true,
    message: "Password reset email sent successfully",
  });
});

const getUserbyId = catchAsync(async (req, res) => {
  const user = await authService.getUserById(req.user._id);
  if (!user) {
    throw new ApiError("User not found", httpStatus.NOT_FOUND);
  }
  res.status(200).send({ data: user });
});

const getUserByFirebaseUid = catchAsync(async (req, res) => {
  const { firebaseUid } = req.params;

  if (!firebaseUid) {
    throw new ApiError("Firebase UID is required", httpStatus.BAD_REQUEST);
  }

  const user = await authService.getUserByFirebaseUId(firebaseUid);

  if (!user) {
    throw new ApiError("User not found", httpStatus.NOT_FOUND);
  }

  res.status(200).json({
    status: true,
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    },
    message: "User found successfully",
  });
});
const editUserInfo = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const updateData = req.body;

  // Validate that the user is updating their own profile or is an admin
  if (req.user._id.toString() !== id && req.user.role !== "admin") {
    throw new ApiError("Unauthorized to edit this user", httpStatus.FORBIDDEN);
  }

  // Remove sensitive fields that shouldn't be updated directly
  const { email, firebaseUid, role, ...allowedUpdates } = updateData;

  const updatedUser = await authService.updateUserById(id, allowedUpdates);

  if (!updatedUser) {
    throw new ApiError("User not found", httpStatus.NOT_FOUND);
  }

  res.status(200).json({
    status: true,
    data: updatedUser,
    message: "User information updated successfully",
  });
});

module.exports = {
  loginUser,
  registerUser,
  generateToken,
  forgotPassword,
  getUserbyId,
  getUserByFirebaseUid,
  editUserInfo,
};
