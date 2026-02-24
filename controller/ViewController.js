const catchAsync = require("../utils/catchAsync.js");
const ApiError = require("../utils/ApiError");
const ViewBrandBlock = require("../model/ViewBrandBlock.js");
const Brand = require("../model/BrandBlock.js");
const sendEmail = require("../utils/sendEmail");
const User = require("../model/User.js");
const createWhoViewedBrandBlock = catchAsync(async (req, res) => {
  console.log("DATA RECEIVED FROM VIEW CONTROLLER:", req.body);
  const { brandId } = req.body;
  const getBrand = await Brand.findOne({ _id: brandId });
  console.log("BRAND FOUND:", getBrand);
  if (!getBrand) {
    throw new ApiError("Brand block ID is required", 400);
  }
  if (req.user._id.toString() === getBrand.owner.toString()) {
    res.status(201).json({ success: true, data: null });
  }
  const userId = req.user._id;
  const user = await User.findOne({ _id: getBrand.owner });

  getBrand.views += 1;
  await getBrand.save();
  const isUserAlreadyViewed = await ViewBrandBlock.findOne({
    brandId: brandId,
    userId: userId,
  });
  if (isUserAlreadyViewed) {
    return res.status(201).json({ success: true, data: null });
  }

  const newView = await ViewBrandBlock.create({
    brandId: brandId,
    userId: userId,
  });
  await sendEmail({
    to: user.email,
    subject: "Your brand block has been viewed",
    html: `
              <div style="font-family: Arial, sans-serif; color: #333;">
                <h2>Hi ${user.name},</h2>
                <p>Great news — your marketing efforts are paying off! 🎉
                A new user has viewed your brand on <strong>BRANDS IN INDIA</strong>.</p>
                <p>View Lead Summary:</p>
                <p>Name: <strong>${req.user.name || "Not Provided"}</strong></p>
                <p>Email:<strong>${req.user.email || "Not provided"}</strong></p>
                <p>Phone:<strong>${
                  req.user.phone || "Not provided"
                }</strong></p>
                <p>Regards,<br><strong>Brands In India Team</strong></p>
              </div>
            `,
  });
  res.status(201).json({ success: true, data: newView });
});

module.exports = { createWhoViewedBrandBlock };
