const BrandBlock = require("../model/BrandBlock");
const catchAsync = require("../utils/catchAsync");
const getALlBrandListForExport = catchAsync(async (req, res, next) => {
  const { paymentStatus = "" } = req.query;
  console.log(paymentStatus);
  let filter = {};
  if (paymentStatus) {
    filter = { paymentStatus };
  }
  const pipline = [
    { $match: filter },
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
      $sort: {
        createdAt: 1,
      },
    },
    {
      $addFields: {
        invoice_number: {
          $concat: [
            "BII/",
            {
              $let: {
                vars: {
                  year: { $year: "$createdAt" },
                  month: { $month: "$createdAt" },
                },
                in: {
                  $cond: [
                    { $gte: ["$$month", 1] },
                    {
                      $concat: [
                        { $toString: "$$year" },
                        "-",
                        {
                          $substr: [
                            { $toString: { $add: ["$$year", 1] } },
                            2,
                            2,
                          ],
                        },
                      ],
                    },
                    {
                      $concat: [
                        { $toString: { $subtract: ["$$year", 1] } },
                        "-",
                        { $substr: [{ $toString: "$$year" }, 2, 2] },
                      ],
                    },
                  ],
                },
              },
            },
            "/",
            { $toString: "$orderNum" },
          ],
        },
        hsnCode: "998361",
        createdAtIST: {
          $dateAdd: {
            startDate: "$createdAt",
            unit: "minute",
            amount: 330, // +5 hours 30 minutes
          },
        },

        createdAtISTDate: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: {
              $dateAdd: {
                startDate: "$createdAt",
                unit: "minute",
                amount: 330,
              },
            },
          },
        },

        createdAtISTTime: {
          $let: {
            vars: {
              hour24: {
                $hour: {
                  $dateAdd: {
                    startDate: "$createdAt",
                    unit: "minute",
                    amount: 330,
                  },
                },
              },
              minute: {
                $minute: {
                  $dateAdd: {
                    startDate: "$createdAt",
                    unit: "minute",
                    amount: 330,
                  },
                },
              },
            },
            in: {
              $concat: [
                {
                  $toString: {
                    $cond: [
                      { $eq: ["$$hour24", 0] },
                      12,
                      {
                        $cond: [
                          { $gt: ["$$hour24", 12] },
                          { $subtract: ["$$hour24", 12] },
                          "$$hour24",
                        ],
                      },
                    ],
                  },
                },
                ":",
                {
                  $cond: [
                    { $lt: ["$$minute", 10] },
                    { $concat: ["0", { $toString: "$$minute" }] },
                    { $toString: "$$minute" },
                  ],
                },
                " ",
                {
                  $cond: [{ $gte: ["$$hour24", 12] }, "PM", "AM"],
                },
              ],
            },
          },
        },

        baseAmountBeforeGST: {
          $divide: [{ $toDouble: "$totalAmount" }, 1.18],
        },

        cgstAmount: {
          $cond: [
            { $eq: ["$location.state", "Punjab"] },
            {
              $multiply: [
                { $divide: [{ $toDouble: "$totalAmount" }, 1.18] },
                0.09,
              ],
            },
            0,
          ],
        },

        sgstAmount: {
          $cond: [
            { $eq: ["$location.state", "Punjab"] },
            {
              $multiply: [
                { $divide: [{ $toDouble: "$totalAmount" }, 1.18] },
                0.09,
              ],
            },
            0,
          ],
        },

        ugstAmount: {
          $cond: [
            { $ne: ["$location.state", "Punjab"] },
            {
              $multiply: [
                { $divide: [{ $toDouble: "$totalAmount" }, 1.18] },
                0.18,
              ],
            },
            0,
          ],
        },
      },
    },
    {
      $project: {
        invoice_number: 1,
        brandName: 1,
        brandContactNo: 1,
        orderNum: 1,
        brandEmailId: 1,
        createdAt: 1,
        paymentStatus: 1,
        totalAmount: 1,
        pendingAmount: 1,
        subscriptionId: 1,
        subscriptionStatus: 1,
        orderId: 1,
        paymentId: 1,
        paymentLinkId: 1,
        subsscriptionPlantType: 1,
        totalBlocks: 1,
        updatedBlocks: 1,
        cgstAmount: 1,
        sgstAmount: 1,
        ugstAmount: 1,
        hsnCode: 1,
        location: 1,
        createdAtISTDate: 1,
        createdAtISTTime: 1,
        baseAmountBeforeGST: 1,
        businessRegistrationNumberGstin: 1,
        owner: {
          $cond: [
            { $ifNull: ["$owner", false] },
            {
              _id: "$owner._id",
              name: "$owner.name",
              phone: "$owner.phone",
              email: "$owner.email",
              isBlocked: "$owner.isBlocked",
            },
            null,
          ],
        },
      },
    },
  ];

  const brandsList = await BrandBlock.aggregate(pipline);
  return res.json({
    success: true,
    message: "Blocks fetched successfully",
    total: brandsList.length,
    data: brandsList,
  });
});

module.exports = { getALlBrandListForExport };
