const GridSpace = require("../model/GridSpace");
const GridLayout = require("../model/GridLayout");
const ApiError = require("../utils/ApiError");
const mongoose = require("mongoose");

const getGridLayouts = async () => {
  return await GridLayout.find({ isActive: true });
};

const getGridLayout = async (id) => {
  return await GridLayout.findById(id).populate("spaces");
};

const getGridSpaces = async (query) => {
  const reqQuery = { ...query };
  const removeFields = [
    "select",
    "sort",
    "page",
    "limit",
    "status",
    "layout",
    "owner",
  ];

  removeFields.forEach((param) => delete reqQuery[param]);

  let queryStr = JSON.stringify(reqQuery);
  queryStr = queryStr.replace(
    /\b(gt|gte|lt|lte|in)\b/g,
    (match) => `$${match}`
  );

  let matchQuery = JSON.parse(queryStr);

  if (query.status) {
    matchQuery.status = query.status;
  }

  if (query.owner) {
    matchQuery.owner = mongoose.Types.ObjectId.isValid(query.owner)
      ? new mongoose.Types.ObjectId(query.owner)
      : null;
  }

  let pipelineStages = [];

  if (query.layout) {
    if (mongoose.Types.ObjectId.isValid(query.layout)) {
      const layout = await GridLayout.findById(query.layout);
      if (layout && layout.spaces && layout.spaces.length > 0) {
        const spaceIds = layout.spaces.map(
          (id) => new mongoose.Types.ObjectId(id)
        );
        matchQuery._id = { $in: spaceIds };
      } else {
        return {
          page: 1,
          limit: parseInt(query.limit, 10) || 25,
          spaces: [],
          totalPages: 0,
          totalResults: 0,
        };
      }
    } else {
      return {
        page: 1,
        limit: parseInt(query.limit, 10) || 25,
        spaces: [],
        totalPages: 0,
        totalResults: 0,
      };
    }
  }

  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 25;
  const skip = (page - 1) * limit;

  pipelineStages = [
    { $match: matchQuery },
    {
      $facet: {
        counts: [{ $count: "totalResults" }],
        results: [
          {
            $sort: query.sort
              ? query.sort.split(",").reduce((acc, field) => {
                  if (field.startsWith("-")) {
                    acc[field.substring(1)] = -1;
                  } else {
                    acc[field] = 1;
                  }
                  return acc;
                }, {})
              : { createdAt: -1 },
          },
          { $skip: skip },
          { $limit: limit },
        ],
      },
    },
  ];

  if (query.select) {
    const fields = query.select.split(",").reduce((acc, field) => {
      acc[field.trim()] = 1;
      return acc;
    }, {});

    pipelineStages[0].$facet.results.push({ $project: fields });
  }

  if (query.select && query.select.includes("owner")) {
    pipelineStages[0].$facet.results.push({
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "ownerData",
      },
    });

    pipelineStages[0].$facet.results.push({
      $addFields: {
        owner: { $arrayElemAt: ["$ownerData", 0] },
      },
    });

    pipelineStages[0].$facet.results.push({
      $project: {
        ownerData: 0,
      },
    });
  }

  const [aggregationResult] = await GridSpace.aggregate(pipelineStages);

  const { counts, results } = aggregationResult;
  const { totalResults = 0 } = counts.length > 0 ? counts[0] : {};

  const totalPages = Math.ceil(totalResults / limit);

  return {
    page,
    limit,
    spaces: results,
    totalPages,
    totalResults,
  };
};

const getGridSpace = async (id) => {
  const space = await GridSpace.findById(id);

  if (!space) {
    return null;
  }

  space.impressions += 1;
  await space.save();

  return space;
};

const recordGridSpaceClick = async (spaceId) => {
  const space = await GridSpace.findById(spaceId);

  if (!space) {
    throw new ApiError("Grid space not found", 404);
  }

  space.clicks += 1;
  await space.save();

  if (space.clickUrl) {
    return {
      redirectUrl: space.clickUrl,
    };
  }

  return { message: "Click recorded" };
};

const VALID_STATUSES = ["available", "reserved", "purchased"];
async function getMyGridSpaces(userId, status, layoutId) {
  const filter = { owner: userId };
  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      throw new ApiError(`Invalid status filter: ${status}`, 400);
    }
    filter.status = status;
  } else {
    filter.status = { $ne: "bidding" };
  }
  if (layoutId) {
    if (!mongoose.Types.ObjectId.isValid(layoutId)) {
      throw new ApiError(`Invalid layout ID: ${layoutId}`, 400);
    }
    const layout = await GridLayout.findById(layoutId).select("spaces");
    if (!layout) {
      throw new ApiError("Layout not found", 404);
    }
    filter._id = { $in: layout.spaces };
  }

  return await GridSpace.find(filter);
}

const getGridSpaceAnalytics = async (spaceId, userId, userRole) => {
  const space = await GridSpace.findById(spaceId);

  if (!space) {
    console.log("Grid space not found for ID:", spaceId);
    throw new ApiError("Grid space not found", 404);
  }

  if (String(space.owner) !== String(userId) && userRole !== "admin") {
    throw new ApiError(
      "Not authorized to view analytics for this grid space",
      401
    );
  }
  return {
    totalClicks: space.clicks,
    totalImpressions: space.impressions,
  };
};

module.exports = {
  getGridLayouts,
  getGridLayout,
  getGridSpaces,
  getGridSpace,
  recordGridSpaceClick,
  getMyGridSpaces,
  getGridSpaceAnalytics,
};
