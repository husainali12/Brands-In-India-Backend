const GridSpace = require("../model/GridSpace");
const Bidding = require("../model/Bidding");
const Transaction = require("../model/Transaction");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const config = require("../config/config");
const mongoose = require("mongoose");
const axios = require("axios");

const razorpay = new Razorpay({
  key_id: config.razorpay.keyId,
  key_secret: config.razorpay.keySecret,
});

const createBidding = catchAsync(async (req, res) => {
  const { gridSpaceId, minimumBid, startDate, endDate } = req.body;
  const now = new Date();

  if (!gridSpaceId || minimumBid == null || !startDate || !endDate) {
    throw new ApiError("Please provide all required fields", 400);
  }
  const startDateTime = new Date(startDate);
  if (isNaN(startDateTime)) {
    throw new ApiError("Invalid startDate", 400);
  }
  if (startDateTime <= now) {
    throw new ApiError("Start date must be in the future", 400);
  }

  const endDateTime = new Date(endDate);
  if (isNaN(endDateTime)) {
    throw new ApiError("Invalid endDate", 400);
  }
  if (endDateTime <= now) {
    throw new ApiError("End date must be in the future", 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const gridSpace = await GridSpace.findById(gridSpaceId).session(session);
    if (!gridSpace) {
      throw new ApiError("Grid space not found", 404);
    }
    if (["purchased", "bidding"].includes(gridSpace.status)) {
      throw new ApiError("This grid space is not available for bidding", 400);
    }

    const existing = await Bidding.findOne({
      gridSpace: gridSpaceId,
      status: "active",
    }).session(session);
    if (existing) {
      throw new ApiError(
        "There is already an active bidding for this grid space",
        400
      );
    }
    const [bidding] = await Bidding.create(
      [
        {
          gridSpace: gridSpaceId,
          startDate: now,
          endDate: endDateTime,
          minimumBid,
          status: "active",
          createdBy: req.user.id,
        },
      ],
      { session }
    );

    gridSpace.status = "bidding";
    gridSpace.activeBidding = bidding._id;
    await gridSpace.save({ session });

    await session.commitTransaction();
    res.status(200).json({ success: true, data: bidding });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const placeBid = catchAsync(async (req, res) => {
  const { biddingId, bidAmount } = req.body;

  if (!biddingId || !bidAmount) {
    throw new ApiError("Please provide all required fields", 400);
  }

  const bidding = await Bidding.findById(biddingId);
  if (!bidding) {
    throw new ApiError("Bidding not found", 404);
  }

  const gridSpace = await GridSpace.findById(bidding.gridSpace);
  if (!gridSpace) {
    throw new ApiError("Grid space not found", 404);
  }

  if (!bidding.isActive()) {
    throw new ApiError("Bidding period is not active", 400);
  }

  if (bidding.status !== "active") {
    bidding.status = "active";
    await bidding.save();
  }

  const highestBid = bidding.getHighestBid();
  if (bidAmount <= highestBid) {
    throw new ApiError(
      `Bid amount must be greater than current highest bid: ${highestBid}`,
      400
    );
  }
  const receiptId = `bid_receipt_${Date.now()}`;
  const options = {
    amount: bidAmount * 100,
    currency: "INR",
    receipt: receiptId,
    payment_capture: 1,
  };

  const order = await razorpay.orders.create(options);

  const transaction = await Transaction.create({
    user: req.user.id,
    gridSpaces: [gridSpace._id],
    amount: bidAmount,
    orderId: order.id,
    paymentId: "",
    paymentStatus: "initiated",
    transactionType: "bid",
    receipt: receiptId,
  });

  res.status(200).json({
    success: true,
    data: { order, transaction, biddingId },
  });
});

const verifyBidPayment = catchAsync(async (req, res) => {
  const { orderId, paymentId, signature, biddingId } = req.body;

  const transaction = await Transaction.findOne({ orderId });
  if (!transaction) {
    throw new ApiError("Transaction not found", 404);
  }

  const bidding = await Bidding.findById(biddingId);
  if (!bidding) {
    throw new ApiError("Bidding not found", 404);
  }

  const expectedSignature = crypto
    .createHmac("sha256", config.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  if (expectedSignature !== signature) {
    transaction.paymentStatus = "failed";
    await transaction.save();
    throw new ApiError("Invalid payment signature", 400);
  }

  transaction.paymentId = paymentId;
  transaction.paymentStatus = "success";
  await transaction.save();

  bidding.bids.push({
    user: req.user.id,
    amount: transaction.amount,
    timestamp: new Date(),
    status: "pending",
    transactionId: transaction._id,
  });
  await bidding.save();

  res.status(200).json({
    success: true,
    data: { transaction, bidding },
  });
});

const getActiveBiddings = catchAsync(async (req, res) => {
  const activeBiddings = await Bidding.find({ status: "active" })
    .populate("gridSpace", "position size price image")
    .populate("bids.user", "name email");

  res.status(200).json({
    success: true,
    count: activeBiddings.length,
    data: activeBiddings,
  });
});

const getBiddingDetails = catchAsync(async (req, res) => {
  const { biddingId } = req.params;

  const bidding = await Bidding.findById(biddingId)
    .populate("gridSpace")
    .populate("bids.user", "name email")
    .populate("createdBy", "name email");

  if (!bidding) {
    throw new ApiError("Bidding not found", 404);
  }

  res.status(200).json({
    success: true,
    data: bidding,
  });
});

const getUserBids = catchAsync(async (req, res) => {
  const bids = await Bidding.find({
    "bids.user": req.user.id,
    status: { $in: ["scheduled", "active"] },
  })
    .populate("gridSpace", "position size price image")
    .select("startDate endDate minimumBid status bids");

  res.status(200).json({
    success: true,
    count: bids.length,
    data: bids,
  });
});

const finalizeBidding = catchAsync(async (req, res) => {
  const { biddingId } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();
  let transactionCommitted = false;

  try {
    const bidding = await Bidding.findById(biddingId)
      .populate("bids.transactionId")
      .session(session);

    if (!bidding) {
      throw new ApiError("Bidding not found", 404);
    }

    if (bidding.status === "completed") {
      throw new ApiError("This bidding is already finalized", 400);
    }

    const now = new Date();
    if (bidding.endDate > now) {
      throw new ApiError("Bidding period is not yet over", 400);
    }

    const gridSpace = await GridSpace.findById(bidding.gridSpace).session(
      session
    );
    if (!gridSpace) {
      throw new ApiError("Grid space not found", 404);
    }

    bidding.status = "completed";

    if (bidding.bids.length === 0) {
      gridSpace.status = "available";
      gridSpace.activeBidding = null;
      await gridSpace.save({ session });
      await bidding.save({ session });

      await session.commitTransaction();
      transactionCommitted = true;
      return res.status(200).json({
        success: true,
        message: "No bids placed, grid space returned to available state",
        data: { bidding, gridSpace },
      });
    }

    const sortedBids = [...bidding.bids].sort((a, b) => b.amount - a.amount);
    const winningBid = sortedBids[0];

    const losingBids = [];
    for (let bid of bidding.bids) {
      if (bid._id.toString() === winningBid._id.toString()) {
        bid.status = "accepted";
      } else {
        bid.status = "rejected";
        losingBids.push(bid);
      }
    }

    bidding.winningBid = winningBid.transactionId;
    await bidding.save({ session });

    gridSpace.status = "purchased";
    gridSpace.owner = winningBid.user;
    gridSpace.price = winningBid.amount;
    gridSpace.activeBidding = null;

    await gridSpace.save({ session });
    await session.commitTransaction();
    transactionCommitted = true;

    for (const losingBid of losingBids) {
      try {
        await refundLosingBid(losingBid);
      } catch (refundError) {
        console.error("Error during refund process:", refundError);
      }
    }

    res.status(200).json({
      success: true,
      message: "Bidding finalized successfully",
      data: { bidding, gridSpace },
    });
  } catch (error) {
    if (!transactionCommitted) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    session.endSession();
  }
});
const refundLosingBid = async (bid) => {
  let transaction;
  let refundTransaction;

  try {
    transaction = await Transaction.findById(bid.transactionId);
    if (!transaction?.paymentId) {
      console.error(
        "Cannot refund bid ID:",
        bid._id,
        "- No valid payment ID found"
      );
      return;
    }

    refundTransaction = new Transaction({
      user: bid.user,
      gridSpaces: [ transaction.gridSpace ],
      amount: bid.amount,
      currency: "INR",
      orderId: transaction.orderId,
      paymentId: transaction.paymentId,
      paymentStatus: "processing",
      receipt: `refund_${Date.now()}`,
    });
    await refundTransaction.save();

    console.log("Attempting refund for payment ID:", transaction.paymentId);

    const response = await axios.post(
      `https://api.razorpay.com/v1/payments/${transaction.paymentId}/refund`,
      {
        amount: Math.round(bid.amount * 100),
        speed: "normal",
        notes: {
          reason: "Refund for losing bid",
          bidId: bid._id.toString(),
        },
        receipt: refundTransaction.receipt,
      },
      {
        auth: {
          username: config.razorpay.keyId,
          password: config.razorpay.keySecret,
        },
        headers: { "Content-Type": "application/json" },
      }
    );

    refundTransaction.paymentStatus = "success";
    await refundTransaction.save();
    console.log(
      "Refund successful for bid ID:",
      bid._id,
      "→ Razorpay refund ID:",
      response.data.id
    );
    return response.data;
  } catch (error) {
    console.error(
      "Error processing refund for bid ID:",
      bid._id,
      error.message
    );
    if (error.response) {
      console.error("Razorpay error response:", {
        status: error.response.status,
        data: error.response.data,
      });
    }

    if (["development", "test"].includes(config.env)) {
      console.log("In test/dev environment: Simulating successful refund");

      if (!refundTransaction) {
        refundTransaction = await Transaction.findOne({
          user: bid.user,
          paymentId: transaction?.paymentId,
          paymentStatus: "processing",
        });
      }
      if (refundTransaction) {
        refundTransaction.paymentStatus = "success";
        await refundTransaction.save();
      }

      return {
        id: `rfnd_mock_${Date.now()}`,
        entity: "refund",
        amount: bid.amount * 100,
        currency: "INR",
        payment_id: transaction?.paymentId,
        notes: { reason: "Refund for losing bid" },
        receipt: refundTransaction?.receipt,
        status: "processed",
      };
    }
    throw error;
  }
};

module.exports = {
  createBidding,
  placeBid,
  verifyBidPayment,
  getActiveBiddings,
  getBiddingDetails,
  getUserBids,
  finalizeBidding,
};
