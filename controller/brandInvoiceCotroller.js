const catchAsync = require("../utils/catchAsync.js");
const ApiError = require("../utils/ApiError");
const BrandInvoice = require("../model/BrandInvoice.js");
const BrandBlock = require("../model/BrandBlock.js");
const syncBrandInvoice = catchAsync(async (req, res, next) => {
  await BrandBlock.aggregate([
    {
      $match: {
        paymentStatus: "success",
      },
    },
    {
      $project: {
        _id: 0, // prevent _id conflict
        orderNum: 1,
        brandName: 1,
        brandContactNo: 1,
        brandEmailId: 1,
        businessRegistrationNumberGstin: 1,
        description: 1,
        details: 1,
        category: 1,
        location: 1,
        logoUrl: 1,
        owner: 1,
        orderId: 1,
        paymentId: 1,
        paymentLinkId: 1,
        paymentLinkUrl: 1,
        paymentStatus: 1,
        totalAmount: 1,
        pendingAmount: 1,
        subscriptionId: 1,
        planId: 1,
        subscriptionStatus: 1,
        subsscriptionPlantType: 1,
        startAt: 1,
        endAt: 1,
        chargeAt: 1,
        nextPaymentDate: 1,
        initialAmount: 1,
        recurringAmount: 1,
        totalBillingCycles: 1,
        totalBlocks: 1,
        updatedBlocks: 1,
        createdAt: 1,
      },
    },
    {
      $merge: {
        into: "brandinvoices", // collection name in lowercase
        on: "orderNum", // must match your UNIQUE index field
        whenMatched: "keepExisting",
        whenNotMatched: "insert",
      },
    },
  ]);

  next();
});

const getAllBrandInvoice = catchAsync(async (req, res, next) => {
  let {
    city,
    state,
    country,
    category,
    search,
    paymentStatus = "success",
    sort = "orderNum",
    order = "asc",
    page = 1,
    limit = 10,
  } = req.query;

  page = parseInt(page, 10);
  limit = parseInt(limit, 10);
  const skip = (page - 1) * limit;

  const matchStage = {};

  if (city) matchStage["location.city"] = new RegExp(city, "i");
  if (state) matchStage["location.state"] = new RegExp(state, "i");
  if (country) matchStage["location.country"] = new RegExp(country, "i");

  if (category) {
    const categories = category.includes(",")
      ? category.split(",").map((c) => c.trim())
      : [category.trim()];
    matchStage.category = { $in: categories };
  }

  if (search) {
    matchStage.$or = [
      { brandName: new RegExp(search, "i") },
      { description: new RegExp(search, "i") },
      { details: new RegExp(search, "i") },
    ];
  }

  matchStage.paymentStatus = paymentStatus;

  const sortStage = {};
  sortStage[sort] = order === "desc" ? -1 : 1;

  const result = await BrandInvoice.aggregate([
    { $match: matchStage },
    {
      $facet: {
        data: [
          { $sort: sortStage },
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
            },
          },
          { $unwind: { path: "$owner", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              orderNum: 1,
              brandName: 1,
              brandContactNo: 1,
              brandEmailId: 1,
              facebookUrl: 1,
              websiteUrl: 1,
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
              paymentStatus: 1,
              initialAmount: 1,
              recurringAmount: 1,
              subscriptionStatus: 1,
              subscriptionId: 1,
              brandCloseTime: 1,
              brandOpenTime: 1,
              brandImagesUrl: 1,
              brandProductsUrl: 1,
              brandOverview: 1,
              subsscriptionPlantType: 1,
              chargeAt: 1,
              startAt: 1,
              endAt: 1,
              createdAt: 1,
              "owner.name": 1,
              "owner.email": 1,
              "owner.isBlocked": 1,
            },
          },
        ],
        totalCount: [{ $count: "count" }],
      },
    },
  ]);

  const data = result[0].data;
  const total = result[0].totalCount[0]?.count || 0;

  res.json({
    success: true,
    message: "Invoices fetched successfully",
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

const updateBrandInvoice = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const updateData = req.body;
  const invoice = await BrandInvoice.findByIdAndUpdate(id, updateData, {
    new: true,
  });
  if (!invoice) {
    return next(new ApiError("Invoice not found", 404));
  }
  res.json({
    success: true,
    message: "Invoice updated successfully",
    data: invoice,
  });
});

module.exports = { syncBrandInvoice, getAllBrandInvoice, updateBrandInvoice };
