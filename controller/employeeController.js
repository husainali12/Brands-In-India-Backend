const employeeModel = require("../model/Employee");
const catchAsync = require("../utils/catchAsync");

const getAllEmployees = catchAsync(async (req, res, next) => {
  let { page = 1, limit = 10, search = "" } = req.query;
  page = parseInt(page, 10);
  limit = parseInt(limit, 10);
  const query = {};

  // Search by name, email, or phone (case-insensitive)
  if (search) {
    query.$or = [{ empId: { $regex: search, $options: "i" } }];
  }
  const totalUsers = await employeeModel.countDocuments(query);
  const totalPages = Math.ceil(totalUsers / limit);
  const employees = await employeeModel
    .find(query)
    .populate("brandId")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  res.status(200).json({
    success: true,
    data: employees,
    count: employees.length,
    totalUsers,
    totalPages,
    page,
  });
});

module.exports = { getAllEmployees };
