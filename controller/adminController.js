const catchAsync = require("../utils/catchAsync");
const adminService = require("../service/adminService");

const createGridLayout = catchAsync(async (req, res) => {
  const payload = {
    name: req.body.name,
    rows: req.body.rows,
    columns: req.body.columns,
    createdBy: req.user._id,
  };
  const layout = await adminService.createGridLayout(payload);
  res.status(201).json({ success: true, data: layout });
});

const updateGridLayout = catchAsync(async (req, res) => {
  const layout = await adminService.updateGridLayout(
    req.params.id,
    req.body,
    req.user._id
  );
  res.status(200).json({
    success: true,
    message: "Layout updated successfully",
    data: layout,
  });
});

const deleteGridLayout = catchAsync(async (req, res) => {
  await adminService.deleteGridLayout(req.params.id, req.user._id);
  res.status(200).json({
    success: true,
    message: "Layout and its spaces deleted successfully",
  });
});

const updateGridSpacePrice = catchAsync(async (req, res) => {
  const space = await adminService.updateGridSpacePrice(
    req.params.id,
    req.body.price,
    req.user._id
  );
  res.status(200).json({ success: true, data: space });
});

const getGridLayoutsWithSpaces = catchAsync(async (req, res) => {
  const { status } = req.query;

  const layouts = await adminService.getGridLayoutsWithSpaces(
    req.user._id,
    status
  );

  res.status(200).json({
    success: true,
    count: layouts.length,
    data: layouts,
  });
});

module.exports = {
  createGridLayout,
  updateGridLayout,
  deleteGridLayout,
  updateGridSpacePrice,
  getGridLayoutsWithSpaces,
};
