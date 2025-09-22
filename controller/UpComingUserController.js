const catchAsync = require("../utils/catchAsync.js");
const ApiError = require("../utils/ApiError");
const UpComingUser = require("../model/UpComingUser");

const createUpComingUser = catchAsync(async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    throw new ApiError("Name and email are required", 400);
  }
  const existingUser = await UpComingUser.findOne({ email });
  //   console.log(existingUser);
  if (existingUser) {
    throw new ApiError("User with this email already exists", 400);
  }
  const newUser = await UpComingUser.create({ name, email });
  res.status(201).json({ success: true, data: newUser });
});

const getAllUpComingUsers = catchAsync(async (req, res) => {
  const users = await UpComingUser.find();
  res.status(200).json({ success: true, count: users.length, data: users });
});
module.exports = { createUpComingUser, getAllUpComingUsers };
