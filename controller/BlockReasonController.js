const BlockReasons = require("../model/BlockReasons");
const catchAsync = require("../utils/catchAsync");

// ✅ Get all block reasons
const getAllBlockReasons = catchAsync(async (req, res) => {
  const reasons = await BlockReasons.find();

  res.status(200).json({
    success: true,
    count: reasons.length,
    data: reasons,
  });
});

module.exports = {
  getAllBlockReasons,
};
