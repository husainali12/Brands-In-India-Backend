const cloudinary = require("cloudinary").v2;
const config = require("../config/config");
const GridSpace = require("../model/GridSpace");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

const uploadGridImage = catchAsync(async (req, res) => {
  const space = await GridSpace.findById(req.params.id);

  if (!space) {
    throw new ApiError("Grid space not found", 404);
  }

  if (space.owner.toString() !== req.user.id && req.user.role !== "admin") {
    throw new ApiError("Not authorized to upload to this grid space", 401);
  }

  if (!req.files || Object.keys(req.files).length === 0) {
    throw new ApiError("No files were uploaded", 400);
  }

  const file = req.files.file;

  if (!file.mimetype.startsWith("image")) {
    throw new ApiError("Please upload an image file", 400);
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new ApiError("Please upload an image less than 10MB", 400);
  }

  const result = await cloudinary.uploader.upload(file.tempFilePath, {
    folder: "brands-in-india",
    width: 500,
    crop: "limit",
  });

  space.image = result.secure_url;
  await space.save();

  res.status(200).json({
    success: true,
    data: {
      fileName: file.name,
      filePath: result.secure_url,
      space,
    },
  });
});

const deleteGridImage = catchAsync(async (req, rest) => {
  const space = await GridSpace.findById(req.params.id);

  if (!space) {
    throw new ApiError("Grid space not found", 404);
  }

  if (space.owner.toString() !== req.user.id && req.user.role !== "admin") {
    throw new ApiError("Not authorized to modify this grid space", 401);
  }

  if (!space.image) {
    throw new ApiError("No image to delete", 400);
  }

  const splitUrl = space.image.split("/");
  const filename = splitUrl[splitUrl.length - 1];
  const public_id = `brands-in-india/${filename.split(".")[0]}`;

  await cloudinary.uploader.destroy(public_id);

  space.image = null;
  await space.save();

  res.status(200).json({
    success: true,
    data: space,
  });
});

const editGridSpace = catchAsync(async (req, res) => {
  const space = await GridSpace.findById(req.params.id);
  if (!space) throw new ApiError("Grid space not found", 404);

  if (
    space.owner.toString() !== req.user._id.toString() &&
    req.user.role !== "admin"
  ) {
    throw new ApiError("Not authorized to edit this grid space", 401);
  }

  const { clickUrl } = req.body;
  let imageUrl;
  if (req.files && req.files.file) {
    const file = req.files.file;
    if (!file.mimetype.startsWith("image"))
      throw new ApiError("Please upload an image file", 400);
    if (file.size > 10 * 1024 * 1024)
      throw new ApiError("Please upload an image less than 10MB", 400);

    const uploadResult = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: "brands-in-india",
      width: 500,
      crop: "limit",
    });
    imageUrl = uploadResult.secure_url;

    if (space.image) {
      const oldFilename = space.image.split("/").pop().split(".")[0];
      await cloudinary.uploader.destroy(`brands-in-india/${oldFilename}`);
    }
  }

  if (!clickUrl && !imageUrl) {
    throw new ApiError("No update parameters provided", 400);
  }

  if (clickUrl) space.clickUrl = clickUrl;
  if (imageUrl) space.image = imageUrl;
  space.updatedAt = Date.now();

  await space.save();
  res.status(200).json({
    success: true,
    data: space,
  });
});

module.exports = { uploadGridImage, deleteGridImage, editGridSpace };
