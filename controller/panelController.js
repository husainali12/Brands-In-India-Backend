const BrandBlock = require("../model/BrandBlock");
const getAllOrders = async (req, res) => {
  try {
    let {
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
      limit = 10,
    } = req.query;
    console.log(lat, lng);
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    let skip = (page - 1) * limit;
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

    const sortOption = {};
    sortOption[sort] = order === "desc" ? -1 : 1;

    if (sort !== "orderNum") {
      sortOption["orderNum"] = 1;
    }

    const total = await BrandBlock.countDocuments(filter);

    const blocks = await BrandBlock.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .select(
        "orderNum brandName brandContactNo brandEmailId facebookUrl websiteUrl createdAt instagramUrl totalAmount totalBlocks orderId paymentId businessRegistrationNumberGstin owner description details category location logoUrl x y w h createdAt paymentStatus initialAmount recurringAmount subscriptionStatus subscriptionId brandCloseTime brandOpenTime brandImagesUrl  brandProductsUrl brandOverview subsscriptionPlantType chargeAt startAt endAt",
      )
      .populate("owner", "name email isBlocked");
    // console.log(blocks);
    return res.json({
      success: true,
      message: "Blocks fetched successfully",
      data: blocks,
      total,
      page: page,
      limit: limit,
      totalPages: Math.ceil(total / limit),
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

module.exports = { getAllOrders };
