const User = require("../model/User");
const catchAsync = require("../utils/catchAsync");
const ApiError = require("../utils/ApiError");

const saveEmail = catchAsync(async (req, res, next) => {
  const { firebaseUid } = req.user;
  let { email } = req.body;

  if (!email) {
    throw new ApiError("Email is required", 400);
  }

  // Normalize email
  email = email.trim().toLowerCase();

  // Basic format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    throw new ApiError("Invalid email format", 400);
  }

  try {
    const updatedUser = await User.findOneAndUpdate(
      { firebaseUid },
      { $set: { email } },
      { new: true, runValidators: true },
    ).select("-password -__v");

    if (!updatedUser) {
      throw new ApiError("User not found", 404);
    }

    return res.status(201).json({
      status: true,
      message: "Email saved successfully",
      data: updatedUser,
    });
  } catch (error) {
    // Handle duplicate key error from MongoDB
    if (error.code === 11000) {
      throw new ApiError("Email already exists. Try another email.", 409);
    }

    throw error;
  }
});

module.exports = { saveEmail };
