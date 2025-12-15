const BrandBlock = require("../model/BrandBlock");
const catchAsync = require("../utils/catchAsync");

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

    // Handle optional logo file upload
    let brandImagesUrl = block.brandImagesUrl || [];

    if (req.files && req.files.file) {
      const files = Array.isArray(req.files.file)
        ? req.files.file
        : [req.files.file];

      for (const file of files) {
        // Validate type
        if (!file.mimetype.startsWith("image")) {
          return res
            .status(400)
            .json({ error: "Please upload only image files." });
        }

        // Validate size (10MB)
        if (file.size > 10 * 1024 * 1024) {
          return res
            .status(400)
            .json({ error: "Each image must be less than 10MB." });
        }

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(file.tempFilePath, {
          folder: "brand_images",
          resource_type: "image",
        });

        // Push into array
        brandImagesUrl.push({
          key: file.name, // or any custom key you want
          url: result.secure_url,
        });
      }
    }

    let brandProductsUrl = block.brandProductsUrl;
    if (req.files && req.files.file) {
      const files = Array.isArray(req.files.file)
        ? req.files.file
        : [req.files.file];

      for (const file of files) {
        // Validate type
        if (!file.mimetype.startsWith("image")) {
          return res
            .status(400)
            .json({ error: "Please upload only image files." });
        }

        // Validate size (10MB)
        if (file.size > 10 * 1024 * 1024) {
          return res
            .status(400)
            .json({ error: "Each image must be less than 10MB." });
        }

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(file.tempFilePath, {
          folder: "brand_products",
          resource_type: "image",
        });

        // Push into array
        brandProductsUrl.push({
          key: file.name, // or any custom key you want
          url: result.secure_url,
        });
      }
    }

    // Prepare updates (only update fields that were sent in body)
    const {
      brandOverview,
      brandOpenTime,
      brandCloseTime,
      IndustriesWeWorkWith,
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
    if (brandProductsUrl) updates.brandProductsUrl = brandProductsUrl;
    if (brandImagesUrl) updates.brandImagesUrl = brandImagesUrl;

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

module.exports = { updateBrandDetailsById };
