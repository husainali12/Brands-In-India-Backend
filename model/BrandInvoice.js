const mongoose = require("mongoose");
const brandInvoiceSchema = new mongoose.Schema({
  orderNum: {
    type: Number,
    required: true,
  },
  brandName: {
    type: String,
    required: [true, "Brand name is required"],
    trim: true,
  },
  brandContactNo: {
    type: String,
    // unique: true,
  },
  // locationUrl: {
  //   type: String,
  //   default: "https://www.google.com/maps/",
  // },
  employmentId: {
    type: String,
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
  },
  brandEmailId: {
    type: String,
    // required: [true, "Please add an email"],
    // unique: true,
  },
  businessRegistrationNumberGstin: {
    type: String,
    // required: [true, "GST number is  required"],
  },
  description: {
    type: String,
    required: [true, "Description is required"],
    trim: true,
  },
  details: {
    type: String,
    required: [true, "Details are required"],
    trim: true,
  },
  category: {
    type: String,
    required: [true, "Category is required"],
    trim: true,
    enum: [
      "Technology",
      "Food",
      "Fashion",
      "Healthcare",
      "Education",
      "Entertainment",
      "Finance",
      "Travel",
      "Other",
    ],
  },
  location: {
    city: {
      type: String,
      required: [true, "City is required"],
      trim: true,
    },
    state: {
      type: String,
      required: [true, "State is required"],
      trim: true,
    },
    coordinates: {
      type: [Number],
      // required: true,
    },
    address: {
      type: String,
      // required: [true, "Address is required"],
      trim: true,
    },
  },
  logoUrl: {
    type: String,
    required: [true, "Logo URL is required"],
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  orderId: {
    type: String,
    default: "",
  },
  paymentId: {
    type: String,
    default: "",
  },
  paymentLinkId: {
    type: String,
    default: "",
  },
  paymentLinkUrl: {
    type: String,
    default: "",
  },
  paymentStatus: {
    type: String,
    enum: ["initiated", "success", "failed"],
    default: "initiated",
  },
  totalAmount: {
    type: Number,
    required: true,
  },
  pendingAmount: {
    type: Number,
    default: 0,
  },
  subscriptionId: {
    type: String,
    default: "",
    index: true, // helps query by subscription quickly
  },
  planId: {
    type: String,
    default: "",
  },
  subscriptionStatus: {
    type: String,
    enum: ["created", "active", "completed", "paused", "cancelled"],
    // default: "created",
  },
  subsscriptionPlantType: {
    type: String,
  },
  startAt: {
    type: Date,
  },
  endAt: {
    type: Date,
  },
  chargeAt: {
    type: Date,
  },
  nextPaymentDate: {
    type: Date,
  },
  initialAmount: {
    type: Number,
    default: 600, // ₹600 initial fee
  },
  recurringAmount: {
    type: Number,
    default: 50, // ₹50 monthly recurring
  },
  totalBillingCycles: {
    type: Number,
    default: 12, // e.g., for a 1-year subscription
  },
  totalBlocks: {
    type: Number,
    required: true,
  },
  updatedBlocks: {
    type: Number,
    default: 0,
  },
});
module.exports = mongoose.model("BrandInvoice", brandInvoiceSchema);
