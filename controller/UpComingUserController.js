const catchAsync = require("../utils/catchAsync.js");
const ApiError = require("../utils/ApiError");
const UpComingUser = require("../model/UpComingUser");

const createUpComingUser = catchAsync(async (req, res) => {
  const { name, email, phone } = req.body;
  if (!name || !email || !phone) {
    throw new ApiError("Name, email and phone are required", 400);
  }
  // Check for existing user by email OR phone
  const existingUser = await UpComingUser.findOne({
    $or: [{ email }, { phone }],
  });

  if (existingUser) {
    throw new ApiError(
      "We already have your email/phone! You will be notified when we launch!",
      400
    );
  }
  const newUser = await UpComingUser.create({ name, email, phone });
  res.status(201).json({ success: true, data: newUser });
});

const getAllUpComingUsers = catchAsync(async (req, res) => {
  const users = await UpComingUser.find();
  res.status(200).json({ success: true, count: users.length, data: users });
});
module.exports = { createUpComingUser, getAllUpComingUsers };
