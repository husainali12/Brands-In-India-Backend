const BrandBlock = require("../model/BrandBlock");
const catchAsync = require("../utils/catchAsync");
const cloudinary = require("cloudinary").v2;
const uploadBrandImages = async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: "No file provided." });
    }

    const files = Array.isArray(req.files.file)
      ? req.files.file
      : [req.files.file];

    // 🔒 Validate all files first
    for (const file of files) {
      if (!file.mimetype?.startsWith("image")) {
        return res.status(400).json({
          error: "Only image files are allowed.",
        });
      }

      if (file.size > 10 * 1024 * 1024) {
        return res.status(400).json({
          error: "Each image must be less than 10MB.",
        });
      }

      if (!file.tempFilePath) {
        return res.status(400).json({
          error: "Temporary file path missing.",
        });
      }
    }

    const brandImagesUrl = [];

    for (const file of files) {
      const result = await cloudinary.uploader.upload(file.tempFilePath, {
        folder: "brand_images",
        resource_type: "image",
      });

      brandImagesUrl.push({
        key: result.public_id,
        url: result.secure_url,
      });
    }

    return res.status(200).json({
      success: true,
      brandImagesUrl,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({
      error: "Server error during upload.",
    });
  }
};

const uploadProductImages = async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: "No file provided." });
    }

    const files = Array.isArray(req.files.file)
      ? req.files.file
      : [req.files.file];

    // 🔒 Validate all files first
    for (const file of files) {
      if (!file.mimetype?.startsWith("image")) {
        return res.status(400).json({
          error: "Only image files are allowed.",
        });
      }

      if (file.size > 10 * 1024 * 1024) {
        return res.status(400).json({
          error: "Each image must be less than 10MB.",
        });
      }

      if (!file.tempFilePath) {
        return res.status(400).json({
          error: "Temporary file path missing.",
        });
      }
    }

    const brandProductsUrl = [];

    for (const file of files) {
      const result = await cloudinary.uploader.upload(file.tempFilePath, {
        folder: "brand_products",
        resource_type: "image",
      });

      brandProductsUrl.push({
        key: result.public_id,
        url: result.secure_url,
      });
    }

    return res.status(200).json({
      success: true,
      brandProductsUrl,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({
      error: "Server error during upload.",
    });
  }
};

const updateBrandDetailsById = async (req, res) => {
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

    // Prepare updates (only update fields that were sent in body)
    const {
      brandOverview,
      brandOpenTime,
      brandCloseTime,
      IndustriesWeWorkWith,
      brandImagesUrl,
      brandProductsUrl,
    } = req.body;

    const updates = {};

    if (IndustriesWeWorkWith) {
      updates.IndustriesWeWorkWith = Array.isArray(IndustriesWeWorkWith)
        ? IndustriesWeWorkWith
        : IndustriesWeWorkWith.split(",").map((i) => i.trim());
    }
    if (brandOpenTime) updates.brandOpenTime = brandOpenTime;
    if (brandOverview) updates.brandOverview = brandOverview;
    if (brandCloseTime) updates.brandCloseTime = brandCloseTime;
    if (Array.isArray(brandImagesUrl) && brandImagesUrl.length > 0) {
      updates.brandImagesUrl = [
        ...(block.brandImagesUrl || []),
        ...brandImagesUrl,
      ];
    }

    if (Array.isArray(brandProductsUrl) && brandProductsUrl.length > 0) {
      updates.brandProductsUrl = [
        ...(block.brandProductsUrl || []),
        ...brandProductsUrl,
      ];
    }

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

module.exports = {
  updateBrandDetailsById,
  uploadBrandImages,
  uploadProductImages,
};
