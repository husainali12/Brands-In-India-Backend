const BrandBlock = require("../model/BrandBlock");
const cloudinary = require("cloudinary").v2;
const Razorpay = require("razorpay");
const config = require("../config/config");
const crypto = require("crypto");
const Category = require("../model/category.model");
const mongoose = require("mongoose");
const Emloyee = require("../model/Employee");
const ApiError = require("../utils/ApiError");
const razorpay = new Razorpay({
  key_id: config.razorpay.keyId,
  key_secret: config.razorpay.keySecret,
});

async function reflowAllBlocks() {
  try {
    await BrandBlock.collection.dropIndex("orderNum_1");
  } catch (err) {}

  let allBlocks = await BrandBlock.find({ paymentStatus: "success" }).lean();

  allBlocks.sort((a, b) => {
    const areaA = a.w * a.h;
    const areaB = b.w * b.h;
    if (areaA !== areaB) {
      return areaB - areaA;
    }
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const occupiedMap = {};
  const bulkOps = [];

  for (let i = 0; i < allBlocks.length; i++) {
    const block = allBlocks[i];
    const { _id, w, h } = block;
    const newOrderNum = i + 1;

    let placed = false;
    const occupiedRows = Object.keys(occupiedMap).map((r) => parseInt(r, 10));
    const maxOccupiedRow =
      occupiedRows.length > 0 ? Math.max(...occupiedRows) : 0;
    const scanLimit = maxOccupiedRow + h;

    outer: for (let yCand = 0; yCand <= scanLimit; yCand++) {
      for (let xCand = 0; xCand <= 20 - w; xCand++) {
        let overlap = false;
        for (let row = yCand; row < yCand + h; row++) {
          const rowArr = occupiedMap[row] || Array(20).fill(false);
          for (let col = xCand; col < xCand + w; col++) {
            if (rowArr[col]) {
              overlap = true;
              break;
            }
          }
          if (overlap) break;
        }
        if (!overlap) {
          for (let row = yCand; row < yCand + h; row++) {
            if (!occupiedMap[row]) {
              occupiedMap[row] = Array(20).fill(false);
            }
            for (let col = xCand; col < xCand + w; col++) {
              occupiedMap[row][col] = true;
            }
          }

          bulkOps.push({
            updateOne: {
              filter: { _id: _id },
              update: {
                x: xCand,
                y: yCand,
                xEnd: xCand + w,
                yEnd: yCand + h,
                orderNum: newOrderNum,
              },
            },
          });

          placed = true;
          break outer;
        }
      }
    }

    if (!placed) {
      throw new Error(`Grid overflow—cannot place block ${_id}`);
    }
  }

  if (bulkOps.length) {
    await BrandBlock.bulkWrite(bulkOps, { ordered: false });
  }
  try {
    await BrandBlock.collection.createIndex({ orderNum: 1 }, { unique: true });
  } catch (err) {
    console.error("Error recreating orderNum index:", err);
  }
}

const uploadLogo = async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: "No file provided." });
    }

    const file = req.files.file;

    if (!file.mimetype.startsWith("image")) {
      return res.status(400).json({ error: "Please upload an image file." });
    }

    if (file.size > 10 * 1024 * 1024) {
      return res
        .status(400)
        .json({ error: "Please upload an image less than 10MB." });
    }

    const result = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: "brand_grids",
      resource_type: "image",
    });

    return res.json({ logoUrl: result.secure_url });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: "Server error during upload." });
  }
};

const confirmAndShift = async (req, res) => {
  try {
    const {
      brandName,
      brandContactNo,
      brandEmailId,
      businessRegistrationNumberGstin,
      description,
      details,
      category,
      location,
      logoUrl,
      facebookUrl,
      instagramUrl,
      employmentId,
      w,
      h,
      longitude,
      latitude,
    } = req.body;

    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (
      typeof brandName !== "string" ||
      typeof brandContactNo !== "string" ||
      typeof brandEmailId !== "string" ||
      typeof businessRegistrationNumberGstin !== "string" ||
      typeof description !== "string" ||
      typeof details !== "string" ||
      typeof employmentId !== "string" ||
      typeof facebookUrl !== "string" ||
      typeof instagramUrl !== "string" ||
      typeof category !== "string" ||
      !location ||
      typeof location !== "object" ||
      !location.city ||
      typeof location.city !== "string" ||
      !location.state ||
      typeof location.state !== "string" ||
      // typeof location.address !== "string" ||
      typeof logoUrl !== "string" ||
      typeof w !== "number" ||
      typeof h !== "number"
    ) {
      return res.status(400).json({ error: "Invalid or missing fields." });
    }

    if (w < 1 || w > 20) {
      return res.status(400).json({ error: "w must be between 1 and 20." });
    }
    if (h < 1) {
      return res.status(400).json({ error: "h must be ≥ 1." });
    }

    const numberOfCells = w * h;
    const unitPrice = 500;
    const totalAmount = numberOfCells * unitPrice;

    const razorpayOrder = await razorpay.orders.create({
      amount: totalAmount * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      payment_capture: 1,
    });

    const locationWithCoordinates = {
      ...location,
      coordinates: [longitude, latitude],
    };

    try {
      const newBlock = new BrandBlock({
        brandName,
        brandContactNo,
        brandEmailId,
        businessRegistrationNumberGstin,
        description,
        details,
        category,
        logoUrl,
        facebookUrl,
        instagramUrl,
        employmentId,
        location: locationWithCoordinates,
        totalBlocks: w * h,
        w,
        h,
        x: 0,
        y: 0,
        xEnd: w,
        yEnd: h,
        owner: req.user._id,
        orderId: razorpayOrder.id,
        paymentStatus: "initiated",
        totalAmount,
      });
      await newBlock.save();
      if (employmentId) {
        const empId = await Emloyee.create({
          empId: employmentId,
          brandId: newBlock._id,
        });
        if (!newBlock) {
          throw new ApiError("Failed to fetch brand block", 404);
        }
        await BrandBlock.findByIdAndUpdate(newBlock._id, {
          employee: empId._id,
        });
      }
      return res.status(200).json({
        success: true,
        data: {
          order: {
            id: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            receipt: razorpayOrder.receipt,
          },
          blockId: newBlock._id,
        },
      });
    } catch (saveError) {
      console.error("Error saving new block:", saveError);
      return res.status(500).json({
        error: "Server error creating block.",
        details: saveError.message,
      });
    }
  } catch (err) {
    console.error("Error in initiatePurchase:", err);
    return res.status(500).json({ error: "Server error initiating purchase." });
  }
};

const updateBlockWithCoords = async (req, res) => {
  try {
    const { blockId } = req.params;
    const { logoUrl, x, y, w, h } = req.body;
    const unitPrice = 500;
    const block = await BrandBlock.findById(blockId);
    if (!block) {
      return res
        .status(404)
        .json({ success: false, message: "Block not found" });
    }
    const oldBlockCount = block.totalBlocks;
    const newBlockCount = w * h;
    if (newBlockCount > 10) {
      return res.status(400).json({
        success: false,
        message: "A brand block cannot exceed 10 tiles",
      });
    } else if (newBlockCount <= oldBlockCount) {
      return res.status(400).json({
        success: false,
        message:
          "You have already selected " +
          block.totalBlocks +
          " tiles, To purchase additional tiles, please select more than " +
          block.totalBlocks +
          " tiles, but not exceeding 10 tiles in total. Thankyou!",
      });
    }
    let extraBlocks = 0;
    let extraPrice = 0;
    console.log("Old block count:", oldBlockCount);
    console.log("New block count:", newBlockCount);
    let razorpayOrder = null;
    if (newBlockCount > oldBlockCount) {
      extraBlocks = newBlockCount - oldBlockCount;
      extraPrice = extraBlocks * unitPrice;
      razorpayOrder = await razorpay.orders.create({
        amount: extraPrice * 100,
        currency: "INR",
        receipt: `update_receipt_${Date.now()}`,
        payment_capture: 1,
      });
      console.log("Created razorpay order:", razorpayOrder);
      block.orderId = razorpayOrder.id;
      block.paymentStatus = "initiated";
      // block.totalAmount = (block.totalAmount || 0) + extraPrice;
      block.pendingAmount = extraPrice;
    }

    block.logoUrl = logoUrl || block.logoUrl;
    block.x = x ?? block.x;
    block.y = y ?? block.y;
    block.w = w ?? block.w;
    block.h = h ?? block.h;
    block.totalBlocks = newBlockCount;
    await block.save();
    return res.status(200).json({
      success: true,
      message: "Block updated successfully",
      data: {
        updatedBlock: block,
        blockId,
        extraBlocks,
        extraPrice,
        payableNow: extraPrice,
        order: razorpayOrder
          ? {
              id: razorpayOrder.id,
              amount: razorpayOrder.amount,
              currency: razorpayOrder.currency,
              receipt: razorpayOrder.receipt,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error in initiatePurchase:", error);
    return res.status(500).json({ error: "Server error initiating purchase." });
  }
};

const verifyPurchase = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, blockId } =
      req.body;

    const block = await BrandBlock.findById(blockId);
    if (!block) {
      return res.status(404).json({ error: "Block not found." });
    }
    if (block.orderId !== razorpayOrderId) {
      return res.status(400).json({ error: "Order ID mismatch." });
    }
    if (block.paymentStatus === "success") {
      return res
        .status(400)
        .json({ error: "Payment already verified for this block." });
    }

    const generatedSignature = crypto
      .createHmac("sha256", config.razorpay.keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (generatedSignature !== razorpaySignature) {
      block.paymentStatus = "failed";
      await BrandBlock.deleteOne({ _id: blockId });
      return res.status(400).json({ error: "Invalid payment signature." });
    }

    block.paymentId = razorpayPaymentId;
    block.paymentStatus = "success";
    const razorpayOrder = await razorpay.orders.fetch(razorpayOrderId);
    const paidAmountINR = razorpayOrder.amount / 100;
    if (!block.totalAmount) {
      block.totalAmount = paidAmountINR;
    } else {
      block.totalAmount = (block.totalAmount || 0) + (block.pendingAmount || 0);
    }

    block.pendingAmount = 0;
    await block.save();

    await reflowAllBlocks();

    const finalBlock = await BrandBlock.findById(blockId).select(
      "_id orderNum brandName brandContactNo brandEmailId businessRegistrationNumberGstin description details location logoUrl x y w h"
    );

    return res.status(200).json({
      success: true,
      data: { block: finalBlock },
    });
  } catch (err) {
    console.error("Error in verifyPurchase:", err);
    return res.status(500).json({ error: "Server error verifying payment." });
  }
};
// order history fields for admin/user panel
const getAllBlocks = async (req, res) => {
  try {
    const {
      city,
      state,
      country,
      category,
      search,
      paymentStatus = "success",
      sort = "orderNum",
      order = "asc",
      page = 1,
      limit = 100,
    } = req.query;

    const filter = {};

    if (city) {
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
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sortOption = {};
    sortOption[sort] = order === "desc" ? -1 : 1;

    if (sort !== "orderNum") {
      sortOption["orderNum"] = 1;
    }

    console.log("Applied filter:", JSON.stringify(filter, null, 2));

    const total = await BrandBlock.countDocuments(filter);

    const blocks = await BrandBlock.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .select(
        "orderNum brandName brandContactNo brandEmailId facebookUrl createdAt instagramUrl totalAmount totalBlocks orderId paymentId businessRegistrationNumberGstin owner description details category location logoUrl x y w h createdAt paymentStatus"
      )
      .populate("owner", "name email isBlocked");

    return res.json({
      success: true,
      message: "Blocks fetched successfully",
      data: blocks,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
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
const createCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Category name is required" });
    }

    const existing = await Category.findOne({ name });
    if (existing) {
      return res.status(400).json({ error: "Category already exists" });
    }

    const category = await Category.create({ name });
    res.status(201).json({ success: true, data: category });
  } catch (err) {
    console.error("Create category error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

const getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: categories });
  } catch (err) {
    console.error("Get category error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

const getBlocksByOwner = async (req, res) => {
  try {
    const { ownerId } = req.params;
    const { page = 1, limit = 3 } = req.query;
    if (req.user._id.toString() !== ownerId) {
      return res.status(403).json({
        success: false,
        message: "You can only view your own blocks",
      });
    }
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 3;
    const skip = (pageNum - 1) * limitNum;
    const blocks = await BrandBlock.find({
      owner: ownerId,
      paymentStatus: "success",
    })
      .select(
        "orderNum brandName brandContactNo brandEmailId businessRegistrationNumberGstin description details category location logoUrl x y w h createdAt totalAmount clicks clickDetails"
      )
      .populate({
        path: "clickDetails.userId",
        select: "name email photoURL",
        model: "User",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);
    // Count total
    const totalBlocks = await BrandBlock.countDocuments({
      owner: ownerId,
      paymentStatus: "success",
    });
    const totalClicks = await BrandBlock.aggregate([
      {
        $match: {
          owner: new mongoose.Types.ObjectId(ownerId),
          paymentStatus: "success",
        },
      },
      {
        $group: {
          _id: null,
          totalClicks: { $sum: "$clicks" },
        },
      },
    ]);
    const totalTilesOwned = await BrandBlock.aggregate([
      {
        $match: {
          owner: new mongoose.Types.ObjectId(ownerId),
          paymentStatus: "success",
        },
      },
      {
        $group: {
          _id: null,
          totalTilesOwned: { $sum: "$totalBlocks" },
        },
      },
    ]);
    let clickRows = [];
    clickRows = blocks.flatMap((block) =>
      (block.clickDetails || []).map((click) => ({
        blockId: block._id,
        brandName: block.brandName,
        logoUrl: block.logoUrl,
        click,
      }))
    );
    clickRows.sort((a, b) => {
      const aTime = a.click?.clickedAt
        ? new Date(a.click.clickedAt).getTime()
        : 0;
      const bTime = b.click?.clickedAt
        ? new Date(b.click.clickedAt).getTime()
        : 0;
      return bTime - aTime;
    });
    const totalPages = Math.ceil(totalBlocks / limitNum);
    return res.status(200).json({
      success: true,
      message: "Blocks fetched successfully",
      page: pageNum,
      limit: limitNum,
      totalBlocks,
      totalTilesOwned,
      totalPages,
      count: blocks.length,
      data: blocks,
      count: blocks.length,
      totalClicks: totalClicks[0]?.totalClicks || 0,
      clickRows,
    });
  } catch (err) {
    console.error("Error in getBlocksByOwner:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching blocks",
      error: err.message,
    });
  }
};
const updateBlocksById = async (req, res) => {
  try {
    const { id } = req.params;

    const block = await BrandBlock.findById(id);
    if (!block) {
      return res.status(404).json({ error: "Block not found." });
    }

    // Only owner or admin can update
    if (
      block.owner.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        error: "Not authorized to update this block.",
      });
    }

    // Handle optional logo file upload
    let newLogoUrl = block.logoUrl;
    if (req.files && req.files.file) {
      const file = req.files.file;
      if (!file.mimetype.startsWith("image")) {
        return res.status(400).json({ error: "Please upload an image file." });
      }
      if (file.size > 10 * 1024 * 1024) {
        return res
          .status(400)
          .json({ error: "Please upload an image less than 10MB." });
      }
      const result = await cloudinary.uploader.upload(file.tempFilePath, {
        folder: "brand_grids",
        resource_type: "image",
      });
      newLogoUrl = result.secure_url;
    }

    // Prepare updates (only update fields that were sent in body)
    const {
      brandName,
      brandContactNo,
      brandEmailId,
      businessRegistrationNumberGstin,
      description,
      details,
      category,
      location,
    } = req.body;

    const updates = {};

    if (brandName) updates.brandName = brandName;
    if (brandContactNo) updates.brandContactNo = brandContactNo;
    if (brandEmailId) updates.brandEmailId = brandEmailId;
    if (businessRegistrationNumberGstin)
      updates.businessRegistrationNumberGstin = businessRegistrationNumberGstin;
    if (description) updates.description = description;
    if (details) updates.details = details;
    if (category) updates.category = category;
    if (location && typeof location === "object") {
      updates.location = {
        ...block.location.toObject(), // preserve existing fields
        ...location, // override with new values
      };
    }
    if (newLogoUrl) updates.logoUrl = newLogoUrl;

    const updatedBlock = await BrandBlock.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json({
      success: true,
      message: "Block updated successfully",
      data: updatedBlock,
    });
  } catch (err) {
    console.error("Error in updateBlocksById:", err);
    return res.status(500).json({
      success: false,
      message: "Server error updating block",
      error: err.message,
    });
  }
};

const recordBrandBlockClick = async (req, res) => {
  try {
    const { id } = req.params;

    const block = await BrandBlock.findById(id);
    if (!block) {
      return res.status(404).json({
        success: false,
        message: "Brand block not found",
      });
    }

    // Always increment the click count regardless of same day
    block.clicks += 1;

    // Check if user has already clicked today on this block
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    const existingClickToday = block.clickDetails.find((click) => {
      const clickDate = new Date(click.clickedAt);
      clickDate.setHours(0, 0, 0, 0); // Start of click day
      return (
        click.userId.toString() === req.user._id.toString() &&
        clickDate.getTime() === today.getTime()
      );
    });

    // Only add click details if user hasn't clicked today
    if (!existingClickToday) {
      // Get user information from the authenticated user (MongoDB User object)
      const userInfo = {
        userId: req.user._id, // MongoDB ObjectId
        // userEmail: req.user.email,
        // userName: req.user.name || req.user.displayName || null,
        // userPhoto: req.user.photoURL || null,
        clickedAt: new Date(),
        // userAgent: req.headers["user-agent"] || null,
        // ipAddress: req.ip || req.connection.remoteAddress || null,
      };

      // Add click details to the array (only once per day)
      block.clickDetails.push(userInfo);
    }

    await block.save();

    // Return redirect URL if available
    if (block.clickUrl) {
      return res.status(200).json({
        success: true,
        redirectUrl: block.clickUrl,
        message: existingClickToday
          ? "Click counted (already recorded today)"
          : "Click recorded",
      });
    }

    return res.status(200).json({
      success: true,
      message: existingClickToday
        ? "Click counted (already recorded today)"
        : "Click recorded",
    });
  } catch (err) {
    console.error("Error in recordBrandBlockClick:", err);
    return res.status(500).json({
      success: false,
      message: "Server error recording click",
      error: err.message,
    });
  }
};

const getBrandBlockClickAnalytics = async (req, res) => {
  try {
    const { id } = req.params;

    const block = await BrandBlock.findById(id).populate({
      path: "clickDetails.userId",
      select: "name email photoURL",
      model: "User",
    });

    if (!block) {
      return res.status(404).json({
        success: false,
        message: "Brand block not found",
      });
    }

    // Check if user is authorized to view analytics
    if (
      block.owner.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view analytics for this brand block",
      });
    }

    // Calculate analytics
    const totalClicks = block.clicks;
    const uniqueUsers = new Set(
      block.clickDetails.map((click) => click.userId.toString())
    ).size;

    // Get recent clicks (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentClicks = block.clickDetails.filter(
      (click) => new Date(click.clickedAt) > thirtyDaysAgo
    );

    // Group clicks by date for chart data
    const clicksByDate = {};
    block.clickDetails.forEach((click) => {
      const date = new Date(click.clickedAt).toISOString().split("T")[0];
      clicksByDate[date] = (clicksByDate[date] || 0) + 1;
    });

    // Get top users by click count
    const userClickCounts = {};
    block.clickDetails.forEach((click) => {
      const userIdStr = click.userId.toString();
      userClickCounts[userIdStr] = (userClickCounts[userIdStr] || 0) + 1;
    });

    const topUsers = Object.entries(userClickCounts)
      .map(([userId, count]) => {
        const userClick = block.clickDetails.find(
          (click) => click.userId.toString() === userId
        );
        return {
          userId,
          userEmail: userClick.userId.email,
          userName: userClick.userId.name,
          // userPhoto: userClick.userId.photoURL,
          clickCount: count,
          lastClicked: userClick.clickedAt,
        };
      })
      .sort((a, b) => b.clickCount - a.clickCount)
      .slice(0, 10); // Top 10 users

    return res.status(200).json({
      success: true,
      data: {
        totalClicks,
        uniqueUsers,
        recentClicks: recentClicks.length,
        clicksByDate,
        topUsers,
        clickDetails: block.clickDetails.slice(-50), // Last 50 clicks
      },
    });
  } catch (err) {
    console.error("Error in getBrandBlockClickAnalytics:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching analytics",
      error: err.message,
    });
  }
};

const getTotalClicksAggregation = async (req, res) => {
  try {
    // Check if user is admin for global analytics
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required for global click analytics",
      });
    }

    // Aggregate total clicks across all brand blocks
    const totalClicksResult = await BrandBlock.aggregate([
      {
        $group: {
          _id: null,
          totalClicks: { $sum: "$clicks" },
          totalPurchasedTiles: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "success"] },
                "$totalBlocks",
                0,
              ],
            },
          },
          totalBlocks: { $sum: 1 },
          totalPaidBlocks: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "success"] }, 1, 0] },
          },
          averageClicksPerBlock: { $avg: "$clicks" },
          maxClicks: { $max: "$clicks" },
          minClicks: { $min: "$clicks" },
        },
      },
    ]);

    // Get clicks by category
    const clicksByCategory = await BrandBlock.aggregate([
      {
        $group: {
          _id: "$category",
          totalClicks: { $sum: "$clicks" },
          blockCount: { $sum: 1 },
          averageClicks: { $avg: "$clicks" },
        },
      },
      {
        $sort: { totalClicks: -1 },
      },
    ]);

    // Get clicks by location (state)
    const clicksByState = await BrandBlock.aggregate([
      {
        $group: {
          _id: "$location.state",
          totalClicks: { $sum: "$clicks" },
          blockCount: { $sum: 1 },
          averageClicks: { $avg: "$clicks" },
        },
      },
      {
        $sort: { totalClicks: -1 },
      },
    ]);

    // Get top performing blocks
    const topPerformingBlocks = await BrandBlock.find({
      paymentStatus: "success",
    })
      .select("brandName category location clicks orderNum createdAt")
      .sort({ clicks: -1 })
      .limit(10);

    // Get blocks with zero clicks
    const zeroClickBlocks = await BrandBlock.countDocuments({
      paymentStatus: "success",
      clicks: 0,
    });

    // Get recent activity (blocks with clicks in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentActivityBlocks = await BrandBlock.aggregate([
      {
        $match: {
          paymentStatus: "success",
          "clickDetails.clickedAt": { $gte: thirtyDaysAgo },
        },
      },
      {
        $project: {
          brandName: 1,
          category: 1,
          clicks: 1,
          recentClicks: {
            $size: {
              $filter: {
                input: "$clickDetails",
                cond: { $gte: ["$$this.clickedAt", thirtyDaysAgo] },
              },
            },
          },
        },
      },
      {
        $sort: { recentClicks: -1 },
      },
      {
        $limit: 10,
      },
    ]);

    // Get overall statistics
    const overallStats = totalClicksResult[0] || {
      totalClicks: 0,
      totalPurchasedTiles: 0,
      totalBlocks: 0,
      totalPaidBlocks: 0,
      averageClicksPerBlock: 0,
      maxClicks: 0,
      minClicks: 0,
    };

    return res.status(200).json({
      success: true,
      message: "Global click analytics retrieved successfully",
      data: {
        overall: {
          totalClicks: overallStats.totalClicks,
          totalPurchasedTiles: overallStats.totalPurchasedTiles,
          totalBlocks: overallStats.totalBlocks,
          totalPaidBlocks: overallStats.totalPaidBlocks,
          averageClicksPerBlock:
            Math.round(overallStats.averageClicksPerBlock * 100) / 100,
          maxClicks: overallStats.maxClicks,
          minClicks: overallStats.minClicks,
          zeroClickBlocks,
          activeBlocks: overallStats.totalPaidBlocks - zeroClickBlocks,
        },
        byCategory: clicksByCategory,
        byState: clicksByState,
        topPerformingBlocks,
        recentActivity: recentActivityBlocks,
      },
    });
  } catch (err) {
    console.error("Error in getTotalClicksAggregation:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching global click analytics",
      error: err.message,
    });
  }
};
const getSuccessfulCreatedAt = async (req, res) => {
  try {
    const data = await BrandBlock.aggregate([
      {
        $match: { paymentStatus: "success" },
      },
      {
        $facet: {
          yearly: [
            {
              $group: {
                _id: { year: { $year: "$createdAt" } },
              },
            },
            { $sort: { "_id.year": -1 } },
            {
              $project: {
                _id: 0,
                year: "$_id.year",
              },
            },
          ],
          monthly: [
            {
              $group: {
                _id: {
                  year: { $year: "$createdAt" },
                  month: { $month: "$createdAt" },
                },
              },
            },
            { $sort: { "_id.year": -1, "_id.month": -1 } },
            {
              $project: {
                _id: 0,
                year: "$_id.year",
                month: "$_id.month",
              },
            },
          ],
          weekly: [
            {
              $group: {
                _id: {
                  year: { $isoWeekYear: "$createdAt" }, // ISO year
                  week: { $isoWeek: "$createdAt" }, // ISO week
                },
              },
            },
            { $sort: { "_id.year": -1, "_id.week": -1 } },
            {
              $project: {
                _id: 0,
                year: "$_id.year",
                week: "$_id.week",
              },
            },
          ],
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: data[0], // because facet wraps results in array
    });
  } catch (err) {
    console.error("Error fetching createdAt groupings:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching createdAt data",
      error: err.message,
    });
  }
};
const getTimeSeriesAnalytics = async (req, res) => {
  try {
    const { range = "monthly", year, month, week } = req.query;

    let groupId = {};
    let dateExpression = null;
    let dateFormat = "";
    const matchStage = {};

    // 🎯 YEARLY filter
    if (year && range === "yearly") {
      const start = new Date(Number(year), 0, 1);
      const end = new Date(Number(year) + 1, 0, 1);
      matchStage.createdAt = { $gte: start, $lt: end };
    }

    // 🎯 MONTHLY filter
    if (month && range === "monthly") {
      const [y, m] = month.split("-").map(Number);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 1); // next month
      matchStage.createdAt = { $gte: start, $lt: end };
    }

    // 🎯 WEEKLY filter (ISO week, e.g. 2025-W35)
    if (week && range === "weekly") {
      const [yearStr, weekStr] = week.split("-W");
      const y = Number(yearStr);
      const w = Number(weekStr);

      // rough start of that week
      const start = new Date(y, 0, 1 + (w - 1) * 7);
      // adjust back to Monday
      while (start.getDay() !== 1) {
        start.setDate(start.getDate() - 1);
      }
      const end = new Date(start);
      end.setDate(end.getDate() + 7);

      matchStage.createdAt = { $gte: start, $lt: end };
    }

    // 🎯 Define grouping based on range
    if (range === "yearly") {
      groupId = { year: { $year: "$createdAt" } };
      dateExpression = { $dateFromParts: { year: "$_id.year" } };
      dateFormat = "%Y";
    } else if (range === "monthly") {
      groupId = {
        year: { $year: "$createdAt" },
        month: { $month: "$createdAt" },
      };
      dateExpression = {
        $dateFromParts: { year: "$_id.year", month: "$_id.month" },
      };
      dateFormat = "%Y-%m";
    } else if (range === "weekly") {
      groupId = {
        year: { $isoWeekYear: "$createdAt" },
        week: { $isoWeek: "$createdAt" },
      };
      dateExpression = {
        $dateFromParts: {
          isoWeekYear: "$_id.year",
          isoWeek: "$_id.week",
        },
      };
      dateFormat = "%G-W%V"; // Example: 2025-W35
    }

    // 🎯 Build pipeline
    const pipeline = [];

    if (Object.keys(matchStage).length) {
      pipeline.push({ $match: matchStage });
    }

    pipeline.push(
      {
        $group: {
          _id: groupId,
          totalPurchasedTiles: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "success"] },
                "$totalBlocks",
                0,
              ],
            },
          },
          revenue: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "success"] },
                "$totalAmount",
                0,
              ],
            },
          },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.week": 1 } },
      {
        $project: {
          _id: 0,
          name: { $dateToString: { format: dateFormat, date: dateExpression } },
          purchased: "$totalPurchasedTiles",
          revenue: "$revenue",
        },
      }
    );

    const data = await BrandBlock.aggregate(pipeline);

    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch analytics" });
  }
};
module.exports = {
  uploadLogo,
  confirmAndShift,
  getAllBlocks,
  verifyPurchase,
  createCategory,
  getCategories,
  getBlocksByOwner,
  recordBrandBlockClick,
  getBrandBlockClickAnalytics,
  getTotalClicksAggregation,
  updateBlocksById,
  getTimeSeriesAnalytics,
  getSuccessfulCreatedAt,
  updateBlockWithCoords,
};
