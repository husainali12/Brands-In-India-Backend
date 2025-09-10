const admin = require("firebase-admin");
const authService = require("../service/authService");
const catchAsync = require("../utils/catchAsync");
const config = require("../config/config");
const fetch = require("node-fetch");
const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const cloudinary = require("cloudinary").v2;

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
const getUsers = catchAsync(async (req, res) => {
  const users = await authService.getUsers(req, res);
  res.status(200).json({
    status: true,
    data: users,
    message: "Users fetched successfully",
  });
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
      photo: user.photo,
      isBlocked: user.isBlocked,
      blockReasons: user.blockReasons,
      role: user.role,
    },
    message: "User found successfully",
  });
});
const uploadProfilePhoto = catchAsync(async (req, res) => {
  // console.log(req.files);
  if (!req.files || !req.files.photo) {
    throw new ApiError("No file provided", httpStatus.BAD_REQUEST);
  }

  const file = req.files.photo;

  // Validate file type - only images allowed
  if (!file.mimetype.startsWith("image")) {
    throw new ApiError("Please upload an image file", httpStatus.BAD_REQUEST);
  }

  // Validate file size - max 5MB
  if (file.size > 5 * 1024 * 1024) {
    throw new ApiError(
      "Please upload an image less than 5MB",
      httpStatus.BAD_REQUEST
    );
  }

  // Upload to Cloudinary
  const result = await cloudinary.uploader.upload(file.tempFilePath, {
    folder: "profile_photos",
    resource_type: "image",
    width: 400,
    height: 400,
    crop: "fill",
    gravity: "face",
  });

  // Update user's profile photo in database
  const updatedUser = await authService.updateUserById(req.user._id, {
    photo: result.secure_url,
  });

  if (!updatedUser) {
    throw new ApiError(
      "Failed to update user profile",
      httpStatus.INTERNAL_SERVER_ERROR
    );
  }

  res.status(200).json({
    status: true,
    data: {
      photoUrl: result.secure_url,
      user: updatedUser,
    },
    message: "Profile photo uploaded successfully",
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
const blockUser = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reasons } = req.body;
  const updatedUser = await authService.updateUserById(id, {
    isBlocked: true,
    blockReasons: reasons, // link block reasons
  });
  res.status(200).json({
    status: true,
    data: updatedUser,
    message: "User blocked successfully",
  });
});
const unblockUser = catchAsync(async (req, res) => {
  const { id } = req.params;
  const updatedUser = await authService.updateUserById(id, {
    isBlocked: false,
    blockReasons: [],
  });
  res.status(200).json({
    status: true,
    data: updatedUser,
    message: "User unblocked successfully",
  });
});
// const deleteUser = catchAsync(async (req, res) => {
//   const { id } = req.params;
//   const updatedUser = await authService.updateUserById(id, { isDeleted: true });
//   res.status(200).json({ data: updatedUser });
// });
// const verifyUser = catchAsync(async (req, res) => {
//   const { id } = req.params;
//   const updatedUser = await authService.updateUserById(id, {
//     isVerified: true,
//   });
//   res.status(200).json({ data: updatedUser });
// });
// const unverifyUser = catchAsync(async (req, res) => {
//   const { id } = req.params;
//   const updatedUser = await authService.updateUserById(id, {
//     isVerified: false,
//   });
//   res.status(200).json({ data: updatedUser });
// });
// const activateUser = catchAsync(async (req, res) => {
//   const { id } = req.params;
//   const updatedUser = await authService.updateUserById(id, { isActive: true });
//   res.status(200).json({ data: updatedUser });
// });
// const deactivateUser = catchAsync(async (req, res) => {
//   const { id } = req.params;
//   const updatedUser = await authService.updateUserById(id, { isActive: false });
//   res.status(200).json({ data: updatedUser });
// });
module.exports = {
  loginUser,
  registerUser,
  generateToken,
  forgotPassword,
  getUserbyId,
  getUserByFirebaseUid,
  editUserInfo,
  uploadProfilePhoto,
  getUsers,
  blockUser,
  unblockUser,
  // deleteUser,
  // verifyUser,
  // unverifyUser,
  // activateUser,
  // deactivateUser,
};
