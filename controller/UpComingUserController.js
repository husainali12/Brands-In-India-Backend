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
  let { page = 1, limit = 10, search = "" } = req.query;

  page = parseInt(page, 10);
  limit = parseInt(limit, 10);

  const query = {};

  // Search by name, email, or phone (case-insensitive)
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
    ];
  }

  const totalUsers = await UpComingUser.countDocuments(query);
  const totalPages = Math.ceil(totalUsers / limit);

  const users = await UpComingUser.find(query)
    .sort({ createdAt: -1 }) // latest first
    .skip((page - 1) * limit)
    .limit(limit);

  res.status(200).json({
    success: true,
    count: users.length,
    totalUsers,
    totalPages,
    page,
    data: users,
  });
});
module.exports = { createUpComingUser, getAllUpComingUsers };
