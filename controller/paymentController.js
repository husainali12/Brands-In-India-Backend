const Razorpay = require("razorpay");
const crypto = require("crypto");
const Transaction = require("../model/Transaction");
const GridSpace = require("../model/GridSpace");
const config = require("../config/config");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");

const razorpay = new Razorpay({
  key_id: config.razorpay.keyId,
  key_secret: config.razorpay.keySecret,
});

const createOrder = catchAsync(async (req, res) => {
  const { gridSpaceIds, amount } = req.body;

  if (!gridSpaceIds || !amount || !Array.isArray(gridSpaceIds)) {
    throw new ApiError("Please provide all required fields", 400);
  }

  const gridSpaces = await GridSpace.find({ _id: { $in: gridSpaceIds } });
  if (gridSpaces.length !== gridSpaceIds.length) {
    throw new ApiError("Some grid spaces not found", 404);
  }

  for (const space of gridSpaces) {
    if (space.status === "purchased") {
      throw new ApiError(`Grid space ${space._id} is already purchased`, 400);
    }
    if (
      space.status === "reserved" &&
      space.owner?.toString() !== req.user.id
    ) {
      throw new ApiError(
        `Grid space ${space._id} is reserved by another user`,
        400
      );
    }
  }

  const receipt = `receipt_${Date.now()}`;
  const totalAmount = amount;
  const order = await razorpay.orders.create({
    amount: totalAmount * 100,
    currency: "INR",
    receipt,
    payment_capture: 1,
  });

  const unitAmount = totalAmount / gridSpaceIds.length;
  const transactions = [];

  for (const space of gridSpaces) {
    const tx = await Transaction.create({
      user: req.user.id,
      gridSpaces: [space._id],
      amount: unitAmount,
      currency: "INR",
      orderId: order.id,
      paymentId: "",
      paymentStatus: "initiated",
      receipt,
    });

    space.status = "reserved";
    await space.save();
    transactions.push(tx);
  }

  res.status(200).json({ success: true, data: { order, transactions } });
});

const verifyPayment = catchAsync(async (req, res) => {
  const { orderId, paymentId, signature } = req.body;
  const transactions = await Transaction.find({ orderId });
  if (!transactions.length) {
    throw new ApiError("No transactions found for this order", 404);
  }

  const expectedSig = crypto
    .createHmac("sha256", config.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  if (expectedSig !== signature) {
    await Promise.all(
      transactions.map(async (tx) => {
        tx.paymentStatus = "failed";
        await tx.save();
        for (const id of tx.gridSpaces) {
          const space = await GridSpace.findById(id);
          if (space) {
            space.status = "available";
            await space.save();
          }
        }
      })
    );
    throw new ApiError("Invalid payment signature", 400);
  }

  await Promise.all(
    transactions.map(async (tx) => {
      tx.paymentId = paymentId;
      tx.paymentStatus = "success";
      await tx.save();
    })
  );

  const allSpaceIds = transactions.flatMap((tx) => tx.gridSpaces);
  const uniqueIds = [...new Set(allSpaceIds.map((id) => id.toString()))];
  const updatedSpaces = await GridSpace.find({ _id: { $in: uniqueIds } });

  await Promise.all(
    updatedSpaces.map(async (space) => {
      space.status = "purchased";
      space.owner = transactions[0].user;
      space.displayStartDate = new Date();
      const days = transactions[0].duration || 30;
      space.displayEndDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const txForSpace = transactions.find(
        (t) => t.gridSpaces[0].toString() === space._id.toString()
      );
      if (txForSpace) {
        space.price = txForSpace.amount;
      }

      await space.save();
      return space;
    })
  );

  res.status(200).json({
    success: true,
    data: { transactions, gridSpaces: updatedSpaces },
  });
});

const getPaymentHistory = catchAsync(async (req, res) => {
  const transactions = await Transaction.find({ user: req.user.id })
    .populate("gridSpaces")
    .sort("-createdAt");

  res.status(200).json({
    success: true,
    count: transactions.length,
    data: transactions,
  });
});

const getTransaction = catchAsync(async (req, res) => {
  const transaction = await Transaction.findById(req.params.id)
    .populate("gridSpaces")
    .populate("user", "name email");

  if (!transaction) {
    throw new ApiError("Transaction not found", 404);
  }

  if (
    transaction.user._id.toString() !== req.user.id &&
    req.user.role !== "admin"
  ) {
    throw new ApiError("Not authorized to access this transaction", 401);
  }

  res.status(200).json({ success: true, data: transaction });
});

module.exports = {
  createOrder,
  verifyPayment,
  getPaymentHistory,
  getTransaction,
};
