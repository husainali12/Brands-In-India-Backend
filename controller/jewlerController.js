const BrandBlock = require("../model/BrandBlock");
const catchAsync = require("../utils/catchAsync");

const getAllJewelersBlocks = async (req, res) => {
  try {
    const {
      city,
      state,
      country,
      lat,
      lng,
      category,
      search,
      paymentStatus = "success",
      sort = "orderNum",
      order = "asc",
      page = 1,
      limit = 100,
    } = req.query;
    console.log(lat, lng);
    const limitNum = Math.max(parseInt(limit, 10) || 1, 1);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (pageNum - 1) * limitNum;

    const hasGeoFilters = lat && lng;
    const filter = {};

    if (!hasGeoFilters && city) {
      filter["location.city"] = new RegExp(city, "i");
    }
    if (state) {
      filter["location.state"] = new RegExp(state, "i");
    }
    if (country) {
      filter["location.country"] = new RegExp(country, "i");
    }
    // filter.category = "Fashion";
    if (category) {
      if (category.includes(",")) {
        const categories = category.split(",").map((cat) => cat.trim());
        filter.category = { $in: categories };
      } else {
        filter.category = category.trim();
      }
    }

    if (search) {
      filter.$or = [
        { brandName: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
        { details: new RegExp(search, "i") },
      ];
    }
    filter.paymentStatus = paymentStatus;

    console.log("Applied filter:", JSON.stringify(filter, null, 2));

    if (hasGeoFilters) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const userLatRad = (Math.PI / 180) * userLat;
      const userLngRad = (Math.PI / 180) * userLng;
      const sinUserLat = Math.sin(userLatRad);
      const cosUserLat = Math.cos(userLatRad);
      const radiusInKm = 500;
      const distanceSortDir = order === "desc" ? -1 : 1;

      const baseMatch = {
        ...filter,
        "location.coordinates.0": { $exists: true, $ne: null },
        "location.coordinates.1": { $exists: true, $ne: null },
      };

      const pipeline = [
        { $match: baseMatch },
        {
          $addFields: {
            distanceKm: {
              $multiply: [
                6371,
                {
                  $acos: {
                    $add: [
                      {
                        $multiply: [
                          {
                            $sin: {
                              $degreesToRadians: {
                                $arrayElemAt: ["$location.coordinates", 1],
                              },
                            },
                          },
                          sinUserLat,
                        ],
                      },
                      {
                        $multiply: [
                          {
                            $cos: {
                              $degreesToRadians: {
                                $arrayElemAt: ["$location.coordinates", 1],
                              },
                            },
                          },
                          cosUserLat,
                          {
                            $cos: {
                              $subtract: [
                                {
                                  $degreesToRadians: {
                                    $arrayElemAt: ["$location.coordinates", 0],
                                  },
                                },
                                userLngRad,
                              ],
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
        {
          $match: {
            distanceKm: { $ne: null, $lte: radiusInKm },
          },
        },
        {
          $sort: {
            distanceKm: distanceSortDir,
            orderNum: 1,
          },
        },
        {
          $facet: {
            data: [
              { $skip: skip },
              { $limit: limitNum },
              {
                $lookup: {
                  from: "users",
                  localField: "owner",
                  foreignField: "_id",
                  as: "owner",
                },
              },
              {
                $unwind: {
                  path: "$owner",
                  preserveNullAndEmptyArrays: true,
                },
              },
              {
                $project: {
                  orderNum: 1,
                  brandName: 1,
                  brandContactNo: 1,
                  brandEmailId: 1,
                  facebookUrl: 1,
                  instagramUrl: 1,
                  totalAmount: 1,
                  totalBlocks: 1,
                  orderId: 1,
                  paymentId: 1,
                  businessRegistrationNumberGstin: 1,
                  description: 1,
                  details: 1,
                  category: 1,
                  location: 1,
                  logoUrl: 1,
                  x: 1,
                  y: 1,
                  w: 1,
                  h: 1,
                  createdAt: 1,
                  paymentStatus: 1,
                  initialAmount: 1,
                  recurringAmount: 1,
                  subscriptionStatus: 1,
                  chargeAt: 1,
                  startAt: 1,
                  endAt: 1,
                  owner: {
                    $cond: [
                      { $ifNull: ["$owner", false] },
                      {
                        _id: "$owner._id",
                        name: "$owner.name",
                        email: "$owner.email",
                        isBlocked: "$owner.isBlocked",
                      },
                      null,
                    ],
                  },
                },
              },
              { $unset: "distanceKm" },
            ],
            total: [{ $count: "count" }],
          },
        },
      ];

      const [result = { data: [], total: [] }] = await BrandBlock.aggregate(
        pipeline
      );
      const blocks = result.data || [];
      const total = result.total?.[0]?.count || 0;

      return res.json({
        success: true,
        message: "Blocks fetched successfully",
        data: blocks,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      });
    }

    const sortOption = {};
    sortOption[sort] = order === "desc" ? -1 : 1;

    if (sort !== "orderNum") {
      sortOption["orderNum"] = 1;
    }

    const total = await BrandBlock.countDocuments(filter);

    const blocks = await BrandBlock.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum)
      .select(
        "orderNum brandName brandContactNo brandEmailId facebookUrl createdAt instagramUrl totalAmount totalBlocks orderId paymentId businessRegistrationNumberGstin owner description details category location logoUrl x y w h createdAt paymentStatus initialAmount recurringAmount subscriptionStatus chargeAt startAt endAt"
      )
      .populate("owner", "name email isBlocked");
    // console.log(blocks);
    return res.json({
      success: true,
      message: "Blocks fetched successfully",
      data: blocks,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    console.error("Error in getAllBlocks:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching blocks.",
      error: err.message,
    });
  }
};

module.exports = { getAllJewelersBlocks };
