const catchAsync = require("../utils/catchAsync");
const gridService = require("../service/gridService");
const GridLayout = require("../model/GridLayout");
const GridSpace = require("../model/GridSpace");

const getGridLayouts = catchAsync(async (req, res) => {
  const layouts = await gridService.getGridLayouts();

  res.status(200).json({
    success: true,
    count: layouts.length,
    data: layouts,
  });
});

const getGridLayout = catchAsync(async (req, res) => {
  const layout = await gridService.getGridLayout(req.params.id);

  if (!layout) {
    return res.status(404).json({
      success: false,
      error: "Layout not found",
    });
  }

  res.status(200).json({
    success: true,
    data: layout,
  });
});

const getGridSpaces = catchAsync(async (req, res) => {
  const result = await gridService.getGridSpaces(req.query);

  return res.status(200).json({
    success: true,
    data: {
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      totalResults: result.totalResults,
      spaces: result.spaces,
    },
    message: "Grid spaces fetched successfully",
  });
});

const getGridSpace = catchAsync(async (req, res) => {
  const space = await gridService.getGridSpace(req.params.id);

  if (!space) {
    return res.status(404).json({
      success: false,
      error: "Grid space not found",
    });
  }

  res.status(200).json({
    success: true,
    data: space,
  });
});

const recordGridSpaceClick = catchAsync(async (req, res) => {
  const result = await gridService.recordGridSpaceClick(req.params.id);

  if (result.redirectUrl) {
    return res.status(200).json({
      success: true,
      redirectUrl: result.redirectUrl,
    });
  }

  res.status(200).json({
    success: true,
    message: "Click recorded",
  });
});

const getMyGridSpaces = catchAsync(async (req, res) => {
  const { status, layout } = req.query;

  const spaces = await gridService.getMyGridSpaces(
    req.user._id,
    status,
    layout
  );

  const spaceIds = spaces.map((space) => space._id);
  const relatedLayouts = await GridLayout.find({
    spaces: { $in: spaceIds },
  }).select("_id spaces");

  const spaceToLayoutMap = {};
  relatedLayouts.forEach((layout) => {
    layout.spaces.forEach((spaceId) => {
      if (!spaceToLayoutMap[spaceId]) {
        spaceToLayoutMap[spaceId] = [];
      }
      spaceToLayoutMap[spaceId].push({
        id: layout._id,
        name: layout.name,
      });
    });
  });

  const enhancedSpaces = spaces.map((space) => {
    const spaceObj = space.toObject();
    spaceObj.layouts = spaceToLayoutMap[space._id] || [];
    return spaceObj;
  });

  res.status(200).json({
    success: true,
    count: enhancedSpaces.length,
    data: {
      layout: layout || null,
      spaces: enhancedSpaces,
    },
  });
});

const getGridSpaceAnalytics = catchAsync(async (req, res) => {
  const analytics = await gridService.getGridSpaceAnalytics(
    req.params.id,
    req.user._id,
    req.user.role
  );

  res.status(200).json({
    success: true,
    data: analytics,
  });
});

const reserveGridSpace = catchAsync(async (req, res) => {
  const { id } = req.params;
  const maxDays = 3;

  const space = await GridSpace.findById(id);
  if (!space) {
    throw new ApiError("Grid space not found", 404);
  }
  if (space.status !== "available") {
    throw new ApiError("Only available spaces can be reserved", 400);
  }

  space.status = "reserved";
  space.owner = req.user.id;
  space.reservationExpiresAt = new Date(
    Date.now() + maxDays * 24 * 60 * 60 * 1000
  );

  await space.save();

  res.status(200).json({ success: true, data: space });
});

module.exports = {
  getGridLayouts,
  getGridLayout,
  getGridSpaces,
  getGridSpace,
  recordGridSpaceClick,
  getMyGridSpaces,
  getGridSpaceAnalytics,
  reserveGridSpace,
};
