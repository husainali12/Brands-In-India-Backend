const BrandBlock = require("../model/BrandBlock");
const cloudinary = require("cloudinary").v2;
const Razorpay = require("razorpay");
const config = require("../config/config");
const crypto = require("crypto");
const Category = require("../model/category.model");

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
      description,
      details,
      category,
      location,
      logoUrl,
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
      typeof description !== "string" ||
      typeof details !== "string" ||
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
        description,
        details,
        category,
        logoUrl,
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
    block.totalAmount = paidAmountINR;
    await block.save();

    await reflowAllBlocks();

    const finalBlock = await BrandBlock.findById(blockId).select(
      "_id orderNum brandName description details location logoUrl x y w h"
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

const getAllBlocks = async (req, res) => {
  try {
    const {
      city,
      state,
      country,
      category,
      search,
      sort = "orderNum",
      order = "asc",
      page = 1,
      limit = 10,
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
        "orderNum brandName description details category location logoUrl x y w h createdAt paymentStatus"
      );

    return res.json({
      success: true,
      message: "Blocks fetched successfully",
      data: blocks,
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

module.exports = {
  uploadLogo,
  confirmAndShift,
  getAllBlocks,
  verifyPurchase,
  createCategory,
  getCategories,
};
