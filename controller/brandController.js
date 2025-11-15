const BrandBlock = require("../model/BrandBlock");
const cloudinary = require("cloudinary").v2;
const User = require("../model/User");
const Razorpay = require("razorpay");
const {
  validatePaymentVerification,
} = require("razorpay/dist/utils/razorpay-utils");
const config = require("../config/config");
const crypto = require("crypto");
const Category = require("../model/category.model");
const mongoose = require("mongoose");
const Emloyee = require("../model/Employee");
const ApiError = require("../utils/ApiError");
const sendEmail = require("../utils/sendEmail");
const { generateInvoicePDF } = require("../utils/generateInvoicePDF");
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
    return new Date(a.createdAt) - new Date(b.createdAt);
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

  const successCount = allBlocks.length;

  const otherBlocks = await BrandBlock.find({
    paymentStatus: { $ne: "success" },
  })
    .sort({ createdAt: 1, _id: 1 })
    .select("_id")
    .lean();

  if (otherBlocks.length) {
    const otherBulkOps = otherBlocks.map((block, idx) => ({
      updateOne: {
        filter: { _id: block._id },
        update: {
          orderNum: successCount + idx + 1,
        },
      },
    }));
    await BrandBlock.bulkWrite(otherBulkOps, { ordered: false });
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
      planType = "",
      duration = 1,
    } = req.body;

    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "Authentication required." });
    }
    await BrandBlock.deleteMany({
      brandEmailId,
      brandContactNo,
      paymentStatus: "initiated",
    });
    const existedBrandEmail = await BrandBlock.findOne({ brandEmailId });
    if (existedBrandEmail) {
      return res.status(401).json({ error: "This Brand Email already exist!" });
    }
    const existBrandContact = await BrandBlock.findOne({ brandContactNo });
    if (existBrandContact) {
      return res
        .status(401)
        .json({ error: "This Brand Contact already exist!" });
    }

    console.log(planType, duration);
    if (
      typeof brandName !== "string" ||
      typeof brandContactNo !== "string" ||
      typeof brandEmailId !== "string" ||
      typeof description !== "string" ||
      typeof details !== "string" ||
      typeof category !== "string" ||
      !location ||
      typeof location !== "object"
    ) {
      return res.status(400).json({ error: "Invalid or missing fields." });
    }

    if (w < 1 || w > 20) {
      return res.status(400).json({ error: "w must be between 1 and 20." });
    }
    if (h < 1) {
      return res.status(400).json({ error: "h must be ≥ 1." });
    }
    // const gstRate = 0.18;
    // const unitPriceWithGST = baseUnitPrice + baseUnitPrice * gstRate;
    const numberOfCells = w * h;
    // const baseUnitPrice = 600;

    // const totalAmount1 = numberOfCells * baseUnitPrice;
    // const totalAmountWithGst = totalAmount1 * 0.18;
    // const totalAmount = totalAmount1 + totalAmountWithGst;
    //Create subscription order instead of normal order
    // const basePricePerTile = 60; // base ₹60
    // const gstRate = 0.18;
    // const priceWithGST = basePricePerTile + basePricePerTile * gstRate; // ₹60 + 18% = ₹70.8
    // const priceWithGSTInPaise = Math.round(priceWithGST * 100); // ₹600 per tile (one time)
    // const monthlyAmount = numberOfCells * priceWithGSTInPaise; // ₹60 per tile per month

    // let planAmount = monthlyAmount;
    // let totalCount = 12;
    // let interval = 1;

    // if (planType === "yearly") {
    //   planAmount = numberOfCells * priceWithGSTInPaise * 12; // ₹60×12 per tile (1 year)
    //   totalCount = duration; // Razorpay treats each as one billing cycle per year
    //   interval = 12; // 12 months interval between yearly payments
    // }
    // ✅ Setup fee calculation (₹600 per tile + 18% GST)
    const setupBasePrice = 600;
    const gstRate = 0.18;
    const setupPriceWithGST = setupBasePrice * (1 + gstRate); // ₹708 per block
    const setupPriceWithGSTInPaise = Math.round(setupPriceWithGST * 100); // 70800 paise
    const totalSetupAmount = numberOfCells * setupPriceWithGST; // e.g. 4 * 708 = 2832 ₹
    const totalSetupAmountInPaise = Math.round(totalSetupAmount * 100);

    // ✅ Monthly plan price (₹60 + 18% GST = ₹70.8 per tile)
    const monthlyBasePrice = 60;
    const monthlyPriceWithGST = monthlyBasePrice * (1 + gstRate); // ₹70.8 per block
    const monthlyPriceWithGSTInPaise = Math.round(monthlyPriceWithGST * 100);
    const monthlyPlanAmount = numberOfCells * monthlyPriceWithGSTInPaise; // ₹70.8 × c

    const yearlyPriceWithGST = monthlyPriceWithGST * 12; // e.g. 70.8 * 12
    const yearlyPriceWithGSTInPaise = Math.round(yearlyPriceWithGST * 100);
    const yearlyPlanAmountInPaise = numberOfCells * yearlyPriceWithGSTInPaise; // paise

    let planPayLoad = {
      period: "monthly",
      interval: 1,
      item: {
        name: `${brandName} ${planType} plan`,
        amount: monthlyPlanAmount,
        currency: "INR",
      },
    };
    let totalBillingCycles = 240; // default monthly long-running
    if (planType === "yearly") {
      planPayLoad = {
        period: "yearly",
        interval: 1,
        item: {
          name: `${brandName} yearly plan`,
          amount: yearlyPlanAmountInPaise,
          currency: "INR",
        },
      };
      // total_count should equal duration (number of yearly cycles)
      // totalBillingCycles = duration || 1;
    }
    const plan = await razorpay.plans.create(planPayLoad);
    // const razorpayOrder = await razorpay.orders.create({
    //   amount: totalAmount * 100,
    //   currency: "INR",
    //   receipt: `receipt_${Date.now()}`,
    //   payment_capture: 1,
    // });
    const { latitude, longitude } = location;
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
        orderId: plan.id,
        paymentStatus: "initiated",
        totalAmount: totalSetupAmount,
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
      // const now = new Date();

      // // Add 1 month
      // const oneMonthLater = new Date();
      // oneMonthLater.setMonth(now.getMonth() + 1);

      // // Get timestamp (in milliseconds)
      // const timestamp = oneMonthLater.getTime();

      // console.log(timestamp);
      // const timestampInSeconds = Math.floor(oneMonthLater.getTime() / 1000);
      // console.log(timestampInSeconds);
      const nowSec = Math.floor(Date.now() / 1000);
      const bufferSeconds = 120;
      let startAtSeconds;
      if (planType === "yearly") {
        // subscription should next bill after 365 days (one year) from now
        startAtSeconds = nowSec + bufferSeconds + 365 * 24 * 3600;
      } else {
        // monthly -> start after 30 days
        startAtSeconds = nowSec + bufferSeconds + 30 * 24 * 3600;
      }
      // let startAtSeconds;
      // if (planType === "yearly") {
      //   startAtSeconds = Math.floor(Date.now() / 1000) + 120; // add buffer
      // }

      // // MONTHLY plan → start 1 month later
      // else {
      //   const oneMonthLater = new Date();
      //   oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
      //   startAtSeconds = Math.floor(oneMonthLater.getTime() / 1000);
      // }

      // const addons = [
      //   {
      //     item: {
      //       name: "Initial Setup Fee",
      //       amount: totalAmount,
      //       currency: "INR",
      //     },
      //   },
      // ];
      // if (planType === "yearly") {
      //   addons.push({
      //     item: {
      //       name: `First Year Payment (${duration} Year${
      //         duration > 1 ? "s" : ""
      //       })`,
      //       amount: planAmount * duration, // full yearly amount up front
      //       currency: "INR",
      //     },
      //   });
      // }
      // console.log(timestampInSeconds);
      let subscriptionPlanId = plan.id;
      let addons = [];
      // let totalBillingCycles = 240; // monthly default

      if (planType === "yearly") {
        // Yearly amount per subscription cycle
        const yearlyAmount = monthlyPriceWithGST * numberOfCells * 12;
        const yearlyAmountInPaise = Math.round(yearlyAmount * 100);

        const initialDeduction = totalSetupAmountInPaise + yearlyAmountInPaise;

        addons.push({
          item: {
            name: "Initial Setup Fee + First Year Payment",
            amount: initialDeduction,
            currency: "INR",
          },
        });

        // totalBillingCycles = duration; // number of yearly cycles (default 1)
      } else {
        addons.push({
          item: {
            name: "Initial Setup Fee",
            amount: totalSetupAmountInPaise,
            currency: "INR",
          },
        });
      }
      const subscription = await razorpay.subscriptions.create({
        plan_id: subscriptionPlanId,
        total_count: planType === "monthly" ? 240 : 1,
        customer_notify: 1,
        start_at: startAtSeconds,
        addons,
        notes: {
          brandBlockId: newBlock._id,
          userId: req.user._id.toString(),
          planType,
          // duration,
        },
      });
      // console.log(subscription);
      await BrandBlock.findByIdAndUpdate(
        newBlock._id,
        {
          orderId: subscription.id,
          subscriptionId: subscription.id,
          planId: plan.id,
          subscriptionStatus: subscription.status,
          subsscriptionPlantType: planType,
          startAt: new Date(subscription.start_at * 1000),
          endAt: subscription.end_at
            ? new Date(subscription.end_at * 1000)
            : null,
          chargeAt: subscription.charge_at
            ? new Date(subscription.charge_at * 1000)
            : null,
          nextPaymentDate: subscription.current_end
            ? new Date(subscription.current_end * 1000)
            : null,
          initialAmount: totalSetupAmount,
          recurringAmount:
            planType === "yearly"
              ? monthlyPriceWithGST * numberOfCells * 12
              : numberOfCells * monthlyPriceWithGST,
          totalBillingCycles: subscription.total_count || 12,
          paymentStatus: "initiated",
        },
        { new: true }
      );
      // save the details here in brand block schema

      return res.status(200).json({
        success: true,
        data: {
          order: {
            id: subscription.id,
            planId: plan.id,
            amount: totalSetupAmount,
            monthlyAmount: (numberOfCells * monthlyPriceWithGST).toFixed(2),
            currency: "INR",
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

// exports.verifySubscription = async (req, res) => {
//   try {
//     const {
//       razorpay_payment_id,
//       razorpay_subscription_id,
//       razorpay_signature,
//       brandBlockId,
//     } = req.body;

//     if (
//       !razorpay_payment_id ||
//       !razorpay_subscription_id ||
//       !razorpay_signature
//     ) {
//       return res.status(400).json({ error: "Missing required fields." });
//     }

//     const generatedSignature = crypto
//       .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//       .update(razorpay_payment_id + "|" + razorpay_subscription_id)
//       .digest("hex");

//     if (generatedSignature !== razorpay_signature) {
//       return res.status(400).json({
//         success: false,
//         error: "Invalid signature verification failed.",
//       });
//     }

//     // ✅ Update payment status in DB
//     await BrandBlock.findByIdAndUpdate(brandBlockId, {
//       paymentStatus: "success",
//       paymentId: razorpay_payment_id,
//       subscriptionId: razorpay_subscription_id,
//     });

//     return res.status(200).json({
//       success: true,
//       message: "Subscription payment verified successfully.",
//     });
//   } catch (err) {
//     console.error("Error verifying subscription:", err);
//     return res.status(500).json({
//       success: false,
//       error: "Server error verifying subscription.",
//       details: err.message,
//     });
//   }
// };

const sendProposal = async (req, res) => {
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
      planType = "",
      duration = 1,
    } = req.body;

    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "Authentication required." });
    }
    await BrandBlock.deleteMany({
      brandEmailId,
      brandContactNo,
      paymentStatus: "initiated",
    });
    const existedBrandEmail = await BrandBlock.findOne({ brandEmailId });
    if (existedBrandEmail) {
      return res.status(401).json({ error: "This Brand Email already exist!" });
    }
    const existBrandContact = await BrandBlock.findOne({ brandContactNo });
    if (existBrandContact) {
      return res
        .status(401)
        .json({ error: "This Brand Contact already exist!" });
    }
    // Basic validation (same as your version)
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
      typeof location.latitude !== "number" ||
      typeof location.longitude !== "number" ||
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
    // // const unitPrice = 500;
    // // const totalAmount = numberOfCells * unitPrice;
    // const baseUnitPrice = 600;
    // const gstRate = 0.18;
    // const unitPriceWithGST = baseUnitPrice + baseUnitPrice * gstRate;
    // const totalAmount = numberOfCells * unitPriceWithGST;
    const baseSetupFee = 600;
    const gst = 0.18;
    const setupFeeWithGST = baseSetupFee * (1 + gst); // 708

    const baseMonthlyPrice = 60;
    const monthlyPriceWithGST = baseMonthlyPrice * (1 + gst); // 70.8

    const setupFee = numberOfCells * setupFeeWithGST;
    const monthlyRecurring = numberOfCells * monthlyPriceWithGST;
    const yearlyRecurring = monthlyRecurring * 12;

    if (planType === "yearly") {
      totalAmount = setupFee + yearlyRecurring;
    } else {
      totalAmount = setupFee;
    }

    const { latitude, longitude } = location;
    const locationWithCoordinates = {
      ...location,
      coordinates: [longitude, latitude],
    };

    // ✅ Step 1: Create a block first to get its _id
    const newBlock = await BrandBlock.create({
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
      totalBlocks: numberOfCells,
      w,
      h,
      x: 0,
      y: 0,
      xEnd: w,
      yEnd: h,
      owner: req.user._id,
      paymentStatus: "initiated",
      totalAmount,
    });

    // ✅ Step 2: Now create the Razorpay payment link using that _id
    const paymentLink = await razorpay.paymentLink.create({
      amount: totalAmount * 100,
      currency: "INR",
      accept_partial: false,
      description: `Payment for ${numberOfCells} tiles for ${brandName}`,
      customer: {
        name: req.user.name,
        email: req.user.email,
        contact: brandContactNo,
      },
      notify: {
        sms: true,
        email: true,
      },
      reminder_enable: true,
      callback_url: `${process.env.FRONTEND_URL}/payment-verify-link?blockId=${newBlock._id}`,
      callback_method: "get",
    });

    // ✅ Step 3: Update block with payment link info
    newBlock.paymentLinkId = paymentLink.id;
    newBlock.paymentLinkUrl = paymentLink.short_url;
    newBlock.subsscriptionPlantType = planType;
    await newBlock.save();

    // ✅ Step 4: Optional - create employee record
    if (employmentId) {
      const empId = await Emloyee.create({
        empId: employmentId,
        brandId: newBlock._id,
      });
      await BrandBlock.findByIdAndUpdate(newBlock._id, { employee: empId._id });
    }

    // ✅ Step 5: Send email with payment link
    // await sendEmail({
    //   to: req.user.email,
    //   subject: `Complete your payment for ${brandName}`,
    //   html: `
    //     <div style="font-family: Arial, sans-serif; color: #333;">
    //       <h2>Hello ${req.user.name || "there"},</h2>
    //       <p>You have initiated a proposal for <strong>${brandName}</strong>.</p>
    //       <p>Total Tiles: <strong>${numberOfCells}</strong></p>
    //       <p>Amount Payable: <strong>₹${totalAmount}</strong></p>
    //       <p>To complete your payment, please click the link below:</p>
    //       <a href="${paymentLink.short_url}"
    //          style="background-color:#007bff; color:white; padding:10px 20px; border-radius:6px; text-decoration:none;">
    //          Pay Now
    //       </a>
    //       <p>This link will expire after a few hours. Please complete your payment promptly.</p>
    //       <br>
    //       <p>Regards,<br><strong>Brands In India Team</strong></p>
    //     </div>
    //   `,
    // });

    return res.status(200).json({
      success: true,
      message: "Proposal created. Payment link sent to your email.",
      data: {
        blockId: newBlock._id,
        paymentLink: paymentLink.short_url,
      },
    });
  } catch (err) {
    console.error("Error in sendProposal:", err);
    return res.status(500).json({
      error: "Server error initiating payment.",
      details: err.message,
    });
  }
};
const verifyPaymentLink = async (req, res) => {
  try {
    const {
      blockId,
      razorpay_payment_id,
      razorpay_payment_link_id,
      razorpay_payment_link_status,
      razorpay_signature,
      razorpay_payment_link_reference_id = "", // default to empty string
    } = req.body;

    // Check authentication
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "Authentication required." });
    }

    // Validate required fields
    if (
      !blockId ||
      !razorpay_payment_id ||
      !razorpay_payment_link_id ||
      !razorpay_signature
    ) {
      return res
        .status(400)
        .json({ error: "Missing required payment details." });
    }

    // Fetch block from DB
    const block = await BrandBlock.findById(blockId);
    if (!block) return res.status(404).json({ error: "Block not found." });

    // If payment already verified
    if (
      block.razorpayPaymentId === razorpay_payment_id &&
      block.paymentStatus === "success"
    ) {
      return res.status(200).json({
        success: true,
        message: "Payment already verified.",
        data: { blockId: block._id, paymentStatus: block.paymentStatus },
      });
    }

    // Validate signature using Razorpay helper
    const isValid = validatePaymentVerification(
      {
        payment_link_id: razorpay_payment_link_id,
        payment_id: razorpay_payment_id,
        payment_link_reference_id: razorpay_payment_link_reference_id,
        payment_link_status: razorpay_payment_link_status,
      },
      razorpay_signature,
      config.razorpay.keySecret
    );

    if (!isValid) {
      return res.status(400).json({ error: "Invalid payment signature." });
    }

    if (razorpay_payment_link_status !== "paid") {
      return res.status(400).json({ error: "Payment not completed yet." });
    }

    // Update block with payment info
    block.paymentStatus = "success";
    block.paymentId = razorpay_payment_id;
    block.paymentLinkId = razorpay_payment_link_id;
    await block.save();

    // const numberOfCells = block.totalBlocks;
    // const basePricePerTile = 60;
    // const gstRate = 0.18;
    // const priceWithGST = basePricePerTile + basePricePerTile * gstRate; // ₹70.8
    // const priceWithGSTInPaise = Math.round(priceWithGST * 100);
    // const monthlyAmount = numberOfCells * priceWithGSTInPaise; // monthly in paise

    // // Subscription start date → next month
    // const now = new Date();
    // const oneMonthLater = new Date();
    // oneMonthLater.setMonth(now.getMonth() + 1);
    // const startAt = Math.floor(oneMonthLater.getTime() / 1000);

    // // Create Razorpay plan (monthly)
    // const plan = await razorpay.plans.create({
    //   period: "monthly",
    //   interval: 1,
    //   item: {
    //     name: `${block.brandName} monthly plan`,
    //     amount: monthlyAmount,
    //     currency: "INR",
    //   },
    // });

    // // Create subscription with setup fee as addon
    // const subscription = await razorpay.subscriptions.create({
    //   plan_id: plan.id,
    //   total_count: 240,
    //   customer_notify: 1,
    //   start_at: startAt,
    //   addons: [
    //     {
    //       item: {
    //         name: "Initial Setup Fee",
    //         amount: Math.round(block.totalAmount * 100), // setup fee in paise
    //         currency: "INR",
    //       },
    //     },
    //   ],
    //   notes: {
    //     brandBlockId: block._id.toString(),
    //     userId: req.user._id.toString(),
    //   },
    // });

    const baseMonthlyPrice = 60;
    const gst = 0.18;
    const monthlyPriceWithGST = baseMonthlyPrice * (1 + gst); // 70.8

    const monthlyRecurringAmount = block.totalBlocks * monthlyPriceWithGST;
    const yearlyRecurringAmount = monthlyRecurringAmount * 12;

    const now = new Date();
    const startAt = new Date(now);

    //------------------------------------------------------
    // MONTHLY PLAN
    //------------------------------------------------------
    if (block.subsscriptionPlantType === "monthly") {
      startAt.setMonth(startAt.getMonth() + 1); // start next month

      const plan = await razorpay.plans.create({
        period: "monthly",
        interval: 1,
        item: {
          name: `${block.brandName} Monthly Subscription`,
          amount: Math.round(monthlyRecurringAmount * 100),
          currency: "INR",
        },
      });

      const subscription = await razorpay.subscriptions.create({
        plan_id: plan.id,
        start_at: Math.floor(startAt.getTime() / 1000),
        total_count: 240, // 20 years
        customer_notify: 1,
        notes: { blockId: block._id.toString() },
      });

      block.subscriptionId = subscription.id;
      block.startAt = new Date(subscription.start_at * 1000);
      block.endAt = subscription.end_at
        ? new Date(subscription.end_at * 1000)
        : null;
      block.chargeAt = subscription.charge_at
        ? new Date(subscription.charge_at * 1000)
        : null;
      block.nextPaymentDate = subscription.current_end
        ? new Date(subscription.current_end * 1000)
        : null;
      block.totalBillingCycles = subscription.total_count || 12;
      block.orderId = subscription.id;
      block.planId = plan.id;
      block.recurringAmount = monthlyRecurringAmount;
      block.subscriptionStatus = subscription.status;
      await block.save();
    }

    //------------------------------------------------------
    // YEARLY PLAN
    //------------------------------------------------------
    else if (block.subsscriptionPlantType === "yearly") {
      startAt.setFullYear(startAt.getFullYear() + 1); // next year

      const plan = await razorpay.plans.create({
        period: "yearly",
        interval: 1,
        item: {
          name: `${block.brandName} Yearly Subscription`,
          amount: Math.round(yearlyRecurringAmount * 100),
          currency: "INR",
        },
      });

      const subscription = await razorpay.subscriptions.create({
        plan_id: plan.id,
        start_at: Math.floor(startAt.getTime() / 1000),
        total_count: 20,
        customer_notify: 1,
        notes: { blockId: block._id.toString() },
      });

      block.subscriptionId = subscription.id;
      block.orderId = subscription.id;
      block.startAt = new Date(subscription.start_at * 1000);
      block.endAt = subscription.end_at
        ? new Date(subscription.end_at * 1000)
        : null;
      block.chargeAt = subscription.charge_at
        ? new Date(subscription.charge_at * 1000)
        : null;
      block.nextPaymentDate = subscription.current_end
        ? new Date(subscription.current_end * 1000)
        : null;
      block.totalBillingCycles = subscription.total_count || 12;
      block.planId = plan.id;
      block.recurringAmount = yearlyRecurringAmount;
      block.subscriptionStatus = subscription.status;
      await block.save();
    }

    // ✅ Step 4: Update DB
    // block.subscriptionId = subscription.id;
    // block.orderId = subscription.id;
    // block.subscriptionId = subscription.id;
    // block.planId = plan.id;
    // block.subscriptionStatus = subscription.status;
    // block.subsscriptionPlantType = block.subsscriptionPlantType;
    block.initialAmount = block.totalAmount;
    // block.recurringAmount = numberOfCells * priceWithGST;
    // block.totalBillingCycles = subscription.total_count || 12;
    await block.save();

    // ✅ Step 5: Activate user's subscription
    await User.findOneAndUpdate(
      { _id: req.user._id },
      { isSubscriptionActive: true },
      { new: true }
    );

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(500).json({ error: "User not found" });
    }
    if (user && block.paymentStatus === "success") {
      try {
        const invoicePath = await generateInvoicePDF(block, user);
        await sendEmail({
          to: user.email,
          subject: `🧾 Invoice for your Brand Purchase - ${block.brandName}`,
          html: `
        <p>Hi ${user.name || "User"},</p>
        <p>Thank you for your payment! Your subscription has been activated.</p>
        <p>Attached is your invoice for reference.</p>
        <p><strong>Subscription ID:</strong> ${block.subscriptionId}</p>
        <p><strong>Plan:</strong> ${block.subsscriptionPlantType} (${
            block.totalBlocks
          } tiles)</p>
        <p><strong>Total Paid:</strong> ₹${block.totalAmount.toFixed(2)}</p>
        <p>We appreciate your business with <b>Brands In India</b>.</p>
        <br/>
        <p>Regards,<br/>Brands In India Team</p>
      `,
          attachments: [
            {
              filename: `Invoice_${block.brandName}.pdf`,
              path: invoicePath,
            },
          ],
        });
      } catch (err) {
        console.error("Email sending failed:", err);
      }
    }
    await reflowAllBlocks();

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully.",
      data: { blockId: block._id, paymentStatus: block.paymentStatus },
    });
  } catch (err) {
    console.error("Error verifying payment:", err);
    return res.status(500).json({ error: "Server error verifying payment." });
  }
};
const verifySubscriptionPayment = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
    } = req.body;

    if (
      !razorpay_payment_id ||
      !razorpay_subscription_id ||
      !razorpay_signature
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Missing payment data." });
    }

    // 1️⃣ Generate expected signature using HMAC SHA256
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
      .digest("hex");

    // 2️⃣ Compare signatures
    if (generated_signature !== razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature." });
    }

    // 3️⃣ Update DB payment status (optional)
    const block = await BrandBlock.findOne({
      subscriptionId: razorpay_subscription_id,
    });
    await User.findOneAndUpdate(
      { firebaseUid: req.params.id },
      { isSubscriptionActive: true }
    );
    if (block) {
      block.paymentStatus = "success";
      block.paymentId = razorpay_payment_id;
      await block.save();
      await reflowAllBlocks();
    }

    res.status(200).json({
      success: true,
      message: "Payment verified successfully.",
    });
  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while verifying payment.",
      error: error.message,
    });
  }
};
// const createSubscription = async (req, res) => {
//   try {
//     const { blockId } = req.body;

//     // 1️⃣ Authentication check
//     if (!req.user || !req.user._id) {
//       return res.status(401).json({ error: "Authentication required." });
//     }

//     // 2️⃣ Input validation
//     if (!blockId) {
//       return res.status(400).json({ error: "Missing blockId." });
//     }

//     // 3️⃣ Fetch brand block
//     const block = await BrandBlock.findById(blockId);
//     if (!block) {
//       return res.status(404).json({ error: "Brand block not found." });
//     }

//     // 4️⃣ Calculate plan & setup fee
//     const monthlyAmount = block.totalBlocks * 50 * 100; // ₹50 per block (paise)
//     const setupFee = block.totalBlocks * 600 * 100; // ₹600 per block (paise)

//     // 5️⃣ Create plan
//     const plan = await razorpay.plans.create({
//       period: "monthly",
//       interval: 1,
//       item: {
//         name: "Brand Subscription Plan",
//         amount: monthlyAmount,
//         currency: "INR",
//       },
//     });

//     // 6️⃣ Create subscription
//     const startTime = Math.floor(Date.now() / 1000) + 5 * 60; // 5 min buffer
//     const subscription = await razorpay.subscriptions.create({
//       plan_id: plan.id,
//       customer_notify: 1,
//       total_count: 12, // 12 months
//       start_at: startTime,
//       addons: [
//         {
//           item: {
//             name: "Initial Setup Charge",
//             amount: setupFee,
//             currency: "INR",
//           },
//         },
//       ],
//       notes: {
//         brandBlockId: blockId,
//         userId: req.user._id.toString(),
//       },
//     });

//     console.log("Razorpay Subscription:", subscription);

//     // 7️⃣ Save subscription details using charge_at, start_at, end_at
//     block.planId = plan.id;
//     block.subscriptionId = subscription.id;
//     block.subscriptionStatus = subscription.status;
//     block.initialAmount = setupFee / 100;
//     block.recurringAmount = monthlyAmount / 100;
//     block.startAt = new Date(subscription.start_at * 1000);
//     block.chargeAt = new Date(subscription.charge_at * 1000);
//     block.endAt = new Date(subscription.end_at * 1000);
//     block.nextPaymentDate = new Date(subscription.charge_at * 1000);

//     await block.save();

//     // 8️⃣ Return response
//     res.status(201).json({
//       success: true,
//       message: "Subscription created successfully.",
//       subscription,
//     });
//   } catch (error) {
//     console.error("Error creating subscription:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error while creating subscription.",
//       error: error.message,
//     });
//   }
// };

// const createSubscription = async (req, res) => {
//   try {
//     const { blockId, planType = "monthly", duration = 1 } = req.body;

//     if (!req.user || !req.user._id) {
//       return res.status(401).json({ error: "Authentication required." });
//     }

//     if (!blockId) {
//       return res.status(400).json({ error: "Missing blockId." });
//     }

//     const block = await BrandBlock.findById(blockId);
//     if (!block) {
//       return res.status(404).json({ error: "Brand block not found." });
//     }

//     // 💰 Base Calculations
//     const totalTiles = block.totalBlocks;
//     const setupFee = totalTiles * 600 * 100; // ₹600/tile
//     const monthlyAmount = totalTiles * 60 * 100; // ₹60/tile/month
//     const yearlyAmount = totalTiles * 60 * 12 * 100; // ₹720/tile/year

//     let recurringAmount = monthlyAmount;
//     let totalCount = 12; // default 1 year
//     let interval = 1;

//     if (planType === "yearly") {
//       recurringAmount = yearlyAmount; // per year
//       totalCount = duration * 12;
//       interval = duration;
//     }

//     // 🪙 1️⃣ Create the recurring plan (for auto deductions)
//     const plan = await razorpay.plans.create({
//       period: "monthly", // Razorpay supports only weekly/monthly
//       interval: 1,
//       item: {
//         name: `${block.brandName} Subscription`,
//         amount: monthlyAmount, // base monthly recurring
//         currency: "INR",
//       },
//     });

//     let orderAmount = setupFee; // default for monthly

//     // 🧾 2️⃣ Calculate initial payment amount
//     if (planType === "yearly") {
//       // initial setup + all yearly charges upfront
//       const totalYearly = yearlyAmount * duration;
//       orderAmount = setupFee + totalYearly;
//     }

//     // 🪙 3️⃣ Create Razorpay order for first payment
//     const order = await razorpay.orders.create({
//       amount: orderAmount,
//       currency: "INR",
//       receipt: `setup_${block._id}_${Date.now()}`,
//       notes: {
//         blockId,
//         planType,
//         purpose:
//           planType === "yearly"
//             ? "Initial + Yearly Fee"
//             : "Initial Setup Fee Only",
//       },
//     });

//     // 📅 4️⃣ Set start time for subscription (after 1 month if monthly)
//     let startTime = Math.floor(Date.now() / 1000) + 5 * 60; // default: start in 5 mins
//     if (planType === "monthly") {
//       const nextMonth = new Date();
//       nextMonth.setMonth(nextMonth.getMonth() + 1);
//       startTime = Math.floor(nextMonth.getTime() / 1000);
//     }

//     // 🔁 5️⃣ Create subscription (for next cycles)
//     const subscription = await razorpay.subscriptions.create({
//       plan_id: plan.id,
//       total_count: totalCount,
//       start_at: startTime,
//       customer_notify: 1,
//       notes: {
//         brandBlockId: blockId,
//         userId: req.user._id.toString(),
//         planType,
//         duration,
//       },
//     });

//     // 💾 6️⃣ Save in DB
//     block.planId = plan.id;
//     block.subscriptionId = subscription.id;
//     block.subscriptionStatus = subscription.status;
//     block.initialAmount = setupFee / 100;
//     block.recurringAmount = monthlyAmount / 100;
//     block.totalBillingCycles = totalCount;
//     block.startAt = new Date(subscription.start_at * 1000);
//     block.endAt = subscription.end_at
//       ? new Date(subscription.end_at * 1000)
//       : null;
//     block.nextPaymentDate =
//       planType === "monthly" ? new Date(block.startAt) : null;
//     await block.save();

//     return res.status(201).json({
//       success: true,
//       message: "Subscription created successfully.",
//       data: {
//         order,
//         subscription,
//         paymentType:
//           planType === "yearly"
//             ? "Initial + Yearly in First Payment"
//             : "Initial Only in First Payment",
//       },
//     });
//   } catch (error) {
//     console.error("Error creating subscription:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error while creating subscription.",
//       error: error.message,
//     });
//   }
// };

const createSubscription = async (req, res) => {
  try {
    const { blockId, planType = "monthly", duration = 1 } = req.body;

    if (!req.user || !req.user._id)
      return res.status(401).json({ error: "Authentication required." });
    if (!blockId) return res.status(400).json({ error: "Missing blockId." });

    const block = await BrandBlock.findById(blockId);
    if (!block)
      return res.status(404).json({ error: "Brand block not found." });

    // Base prices per tile
    // const setupFee = block.totalBlocks * 600 * 100;
    const basePricePerTile = 60; // base ₹60
    const gstRate = 0.18;
    const priceWithGST = basePricePerTile + basePricePerTile * gstRate; // ₹60 + 18% = ₹70.8
    const priceWithGSTInPaise = Math.round(priceWithGST * 100); // ₹600 per tile (one time)
    const monthlyAmount = block.totalBlocks * priceWithGSTInPaise; // ₹60 per tile per month

    let planAmount = monthlyAmount;
    let totalCount = 12;
    let interval = 1;

    if (planType === "yearly") {
      planAmount = block.totalBlocks * priceWithGSTInPaise * 12; // ₹60×12 per tile (1 year)
      totalCount = duration; // Razorpay treats each as one billing cycle per year
      interval = 12; // 12 months interval between yearly payments
    }

    // Create Razorpay plan
    const plan = await razorpay.plans.create({
      period: "monthly",
      interval: planType === "yearly" ? 12 : 1,
      item: {
        name: `${block.brandName} ${planType} plan`,
        amount: planAmount,
        currency: "INR",
      },
    });

    // Start in 5 minutes to allow checkout flow

    // Addon logic:
    // Monthly → only initial setupFee
    // Yearly → setupFee + first year's recurring included at once
    // const addons = [
    //   {
    //     item: {
    //       name: "Initial Setup Fee",
    //       amount: setupFee,
    //       currency: "INR",
    //     },
    //   },
    // ];
    // if (planType === "yearly") {
    //   addons.push({
    //     item: {
    //       name: `First Year Payment (${duration} Year${
    //         duration > 1 ? "s" : ""
    //       })`,
    //       amount: planAmount * duration, // full yearly amount up front
    //       currency: "INR",
    //     },
    //   });
    // }

    const subscription = await razorpay.subscriptions.create({
      plan_id: plan.id,
      total_count: totalCount,
      customer_notify: 1,
      // start_at: startTime,
      // addons,
      notes: {
        brandBlockId: blockId,
        userId: req.user._id.toString(),
        planType,
        duration,
      },
    });
    // console.log(subscription);
    // Save metadata
    block.planId = plan.id;
    block.subscriptionId = subscription.id;
    block.subscriptionStatus = subscription.status;
    block.subsscriptionPlantType = subscription.notes.planType;
    // block.initialAmount = setupFee / 100;
    block.recurringAmount = planAmount / 100;
    block.totalBillingCycles = totalCount;
    if (subscription.start_at)
      block.startAt = new Date(subscription.start_at * 1000);
    if (subscription.charge_at)
      block.chargeAt = new Date(subscription.charge_at * 1000);
    if (subscription.end_at) block.endAt = new Date(subscription.end_at * 1000);
    await block.save();

    res.status(201).json({
      success: true,
      message: "Subscription created successfully.",
      subscription,
    });
  } catch (error) {
    console.error("Error creating subscription:", error);
    res.status(500).json({
      success: false,
      message: "Server error while creating subscription.",
      error: error,
    });
  }
};
const updateBlockWithCoords = async (req, res) => {
  try {
    const { blockId } = req.params;
    const { logoUrl, x, y, w, h } = req.body;
    const baseUnitPrice = 600;
    const gstRate = 0.18;
    const unitPrice = baseUnitPrice + baseUnitPrice * gstRate;
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
    // console.log("Old block count:", oldBlockCount);
    // console.log("New block count:", newBlockCount);
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
      // console.log("Created razorpay order:", razorpayOrder);
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
    // await block.save();
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
    const {
      razorpaySubscriptionId,
      razorpayPaymentId,
      razorpaySignature,
      blockId,
    } = req.body;

    const block = await BrandBlock.findById(blockId);
    if (!block) {
      return res.status(404).json({ error: "Block not found." });
    }
    if (block.orderId !== razorpaySubscriptionId) {
      return res.status(400).json({ error: "Order ID mismatch." });
    }
    if (block.paymentStatus === "success") {
      return res
        .status(400)
        .json({ error: "Payment already verified for this block." });
    }

    const generatedSignature = crypto
      .createHmac("sha256", config.razorpay.keySecret)
      .update(`${razorpayPaymentId}|${razorpaySubscriptionId}`)
      .digest("hex");

    if (generatedSignature !== razorpaySignature) {
      block.paymentStatus = "failed";
      await BrandBlock.deleteOne({ _id: blockId });
      return res.status(400).json({ error: "Invalid payment signature." });
    }

    block.paymentId = razorpayPaymentId;
    block.paymentStatus = "success";
    let paidAmountINR = 0;
    const razorpaySubscription = await razorpay.subscriptions.fetch(
      razorpaySubscriptionId
    );

    if (razorpaySubscription?.plan?.item?.amount) {
      paidAmountINR = razorpaySubscription.plan.item.amount / 100;
    } else if (razorpaySubscription?.plan_id) {
      const plan = await razorpay.plans.fetch(razorpaySubscription.plan_id);
      paidAmountINR = plan?.item?.amount ? plan.item.amount / 100 : 0;
    }

    if (!block.totalAmount) {
      block.totalAmount = paidAmountINR;
    } else {
      block.totalAmount = (block.totalAmount || 0) + (block.pendingAmount || 0);
    }

    block.pendingAmount = 0;
    await block.save();
    if (req.user) {
      const userUpdateQuery = req.user.firebaseUid
        ? { firebaseUid: req.user.firebaseUid }
        : { _id: req.user._id };

      const user = await User.findOneAndUpdate(
        userUpdateQuery,
        { isSubscriptionActive: true },
        { new: true }
      );

      console.log("Subscription activated for user:", user?.email || "unknown");
    }
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(500).json({ error: "User not found" });
    }
    if (user && block.paymentStatus === "success") {
      try {
        const invoicePath = await generateInvoicePDF(block, user);
        await sendEmail({
          to: user.email,
          subject: `🧾 Invoice for your Brand Purchase - ${block.brandName}`,
          html: `
        <p>Hi ${user.name || "User"},</p>
        <p>Thank you for your payment! Your subscription has been activated.</p>
        <p>Attached is your invoice for reference.</p>
        <p><strong>Subscription ID:</strong> ${block.subscriptionId}</p>
        <p><strong>Plan:</strong> ${block.subsscriptionPlantType} (${
            block.totalBlocks
          } tiles)</p>
        <p><strong>Total Paid:</strong> ₹${block.totalAmount.toFixed(2)}</p>
        <p>We appreciate your business with <b>Brands In India</b>.</p>
        <br/>
        <p>Regards,<br/>Brands In India Team</p>
      `,
          attachments: [
            {
              filename: `Invoice_${block.brandName}.pdf`,
              path: invoicePath,
            },
          ],
        });
      } catch (err) {
        console.error("Email sending failed:", err);
      }
    }
    await reflowAllBlocks();

    const finalBlock = await BrandBlock.findById(blockId).select(
      "_id orderNum brandName brandContactNo brandEmailId businessRegistrationNumberGstin description details location logoUrl x y w h initialAmount recurringAmount subscriptionStatus chargeAt startAt endAt"
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
        "orderNum brandName brandContactNo brandEmailId businessRegistrationNumberGstin description details category location logoUrl x y w h createdAt totalAmount clicks clickDetails initialAmount recurringAmount totalBlocks subscriptionStatus subsscriptionPlantType totalBillingCycles chargeAt startAt endAt"
      )
      .populate({
        path: "clickDetails.userId",
        select: "name email phone photoURL",
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
    // const today = new Date();
    // today.setHours(0, 0, 0, 0); // Start of today

    // const existingClickToday = block.clickDetails.find((click) => {
    //   const clickDate = new Date(click.clickedAt);
    //   clickDate.setHours(0, 0, 0, 0); // Start of click day
    //   return (
    //     click.userId.toString() === req.user._id.toString() &&
    //     clickDate.getTime() === today.getTime()
    //   );
    // });
    const existingClick = block.clickDetails.find(
      (click) => click.userId.toString() === req.user._id.toString()
    );
    // Only add click details if user hasn't clicked today
    if (!existingClick) {
      // Get user information from the authenticated user (MongoDB User object)
      const userInfo = {
        userId: req.user._id,
        clickedAt: new Date(),
      };

      // Add click details to the array (only once)
      block.clickDetails.push(userInfo);
      // sendGrid function to send click info
      const user = await User.findById(block.owner._id);
      // console.log(user);
      await sendEmail({
        to: user.email,
        subject: `You’ve Got a New Lead! Take Action Now`,
        html: `
        <div style="font-family: Arial, sans-serif; color: #333;">
          <h2>Hi ${user.name},</h2>
          <p>Great news — your marketing efforts are paying off! 🎉
A new lead has just been generated through your account on <strong>BRANDS IN INDIA</strong>.</p>
          <p>Lead Summary:</p>
          <p>Name: <strong>${req.user.name}</strong></p>
          <p>Email:<strong>${req.user.email}</strong></p>
          <p>Phone:<strong>${req.user.phone || "Not provided"}</strong></p>
          <p>Regards,<br><strong>Brands In India Team</strong></p>
        </div>
      `,
      });
    }

    await block.save();

    // Return redirect URL if available
    if (block.clickUrl) {
      return res.status(200).json({
        success: true,
        redirectUrl: block.clickUrl,
        message: existingClick
          ? "Click counted (already recorded today)"
          : "Click recorded",
      });
    }

    return res.status(200).json({
      success: true,
      message: existingClick
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
  sendProposal,
  verifyPaymentLink,
  createSubscription,
  verifySubscriptionPayment,
  reflowAllBlocks,
};
