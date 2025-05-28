const GridSpace = require("../model/GridSpace");
const GridLayout = require("../model/GridLayout");
const ApiError = require("../utils/ApiError");
const httpStatus = require("http-status");

async function createGridLayout({ name, rows, columns, createdBy }) {
  let layout;
  try {
    layout = await GridLayout.create({ name, rows, columns, createdBy });
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(
        "A layout with this name already exists for this user.",
        httpStatus.BAD_REQUEST
      );
    }
    throw error;
  }

  const spaceIds = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const space = await GridSpace.create({
        position: { x, y },
        size: { width: 1, height: 1 },
        price: 9999,
      });
      spaceIds.push(space._id);
    }
  }

  layout.spaces = spaceIds;
  await layout.save();

  return layout;
}

async function updateGridLayout(id, updateBody, userId) {
  const layout = await GridLayout.findById(id);
  if (!layout) throw new ApiError("Layout not found", 404);
  if (!layout.createdBy.equals(userId)) {
    throw new ApiError("Not authorized to update this layout", 403);
  }

  const rowsChanged = updateBody.rows && updateBody.rows !== layout.rows;
  const columnsChanged =
    updateBody.columns && updateBody.columns !== layout.columns;

  Object.assign(layout, updateBody);

  if (rowsChanged || columnsChanged) {
    await GridSpace.deleteMany({ _id: { $in: layout.spaces } });

    const spaceIds = [];
    for (let y = 0; y < layout.rows; y++) {
      for (let x = 0; x < layout.columns; x++) {
        const space = await GridSpace.create({
          position: { x, y },
          size: { width: 1, height: 1 },
        });
        spaceIds.push(space._id);
      }
    }
    layout.spaces = spaceIds;
  }

  await layout.save();
  return layout;
}

async function deleteGridLayout(id, userId) {
  const layout = await GridLayout.findById(id);
  if (!layout) throw new ApiError("Layout not found", 404);
  if (!layout.createdBy.equals(userId)) {
    throw new ApiError("Not authorized to delete this layout", 403);
  }
  await GridSpace.deleteMany({ _id: { $in: layout.spaces } });

  await layout.deleteOne();
}

async function updateGridSpacePrice(id, price, userId) {
  if (price == null) {
    throw new ApiError("Please provide a price", 400);
  }
  const layout = await GridLayout.findOne({ spaces: id, createdBy: userId });
  if (!layout) {
    throw new ApiError("Grid space not found or not authorized", 404);
  }
  const space = await GridSpace.findById(id);
  if (space.status !== "available" || space.owner) {
    throw new ApiError("Cannot update price: slot is no longer available", 400);
  }
  space.price = price;
  await space.save();
  return space;
}

const VALID_STATUSES = ["available", "reserved", "bidding"];

async function getGridLayoutsWithSpaces(userId, status) {
  const filter = {
    isActive: true,
    createdBy: userId,
  };
  const popOpts = {
    path: "spaces",
  };

  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      throw new ApiError(`Invalid status: ${status}`, 400);
    }
    popOpts.match = { status };
  }
   const layouts = await GridLayout.find(filter)
    .populate(popOpts)
    .lean();

  layouts.sort((a, b) => {
    const getLatestPurchaseDate = (spaces) => {
      const purchasedSpaces = spaces.filter(s => s.status === 'purchased' && s.purchasedAt);
      if (purchasedSpaces.length === 0) return new Date(0);
      return Math.max(...purchasedSpaces.map(s => new Date(s.purchasedAt)));
    };

    const aLatest = getLatestPurchaseDate(a.spaces);
    const bLatest = getLatestPurchaseDate(b.spaces);
    
    return bLatest - aLatest;
  });

  return layouts;
}

module.exports = {
  createGridLayout,
  updateGridLayout,
  deleteGridLayout,
  updateGridSpacePrice,
  getGridLayoutsWithSpaces,
};
