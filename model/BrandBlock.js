const mongoose = require("mongoose");
const validator = require("validator");
const BrandBlockSchema = new mongoose.Schema({
  orderNum: {
    type: Number,
    // required: true
  },
  brandName: {
    type: String,
    required: [true, "Brand name is required"],
    trim: true,
  },
  brandContactNo: {
    type: String,
    validate: [validator.isMobilePhone, "Please provide correct phone number!"],
    unique: true,
  },
  // locationUrl: {
  //   type: String,
  //   default: "https://www.google.com/maps/",
  // },
  facebookUrl: {
    type: String,
    // default: "https://www.facebook.com/",
  },
  instagramUrl: {
    type: String,
    // default: "https://www.instagram.com/",
  },
  brandEmailId: {
    type: String,
    // required: [true, "Please add an email"],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      "Please add a valid email",
    ],
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

  w: {
    type: Number,
    required: [true, "Width (w) is required"],
    min: [1, "Width must be at least 1"],
    max: [20, "Width cannot exceed 20"],
  },
  h: {
    type: Number,
    required: [true, "Height (h) is required"],
    min: [1, "Height must be at least 1"],
  },
  x: {
    type: Number,
    required: true,
    min: [0, "x cannot be negative"],
    max: [19, "x must be between 0 and 19"],
  },
  y: {
    type: Number,
    required: true,
    min: [0, "y cannot be negative"],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  xEnd: {
    type: Number,
    required: true,
  },
  yEnd: {
    type: Number,
    required: true,
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
  totalBlocks: {
    type: Number,
    required: true,
    default: () => this.w * this.h,
  },
  clicks: {
    type: Number,
    default: 0,
  },
  clickDetails: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      // userEmail: {
      //   type: String,
      //   required: true,
      // },
      // userName: {
      //   type: String,
      //   default: null,
      // },
      // userPhoto: {
      //   type: String,
      //   default: null,
      // },
      clickedAt: {
        type: Date,
        default: Date.now,
      },
      // userAgent: {
      //   type: String,
      //   default: null,
      // },
      // ipAddress: {
      //   type: String,
      //   default: null,
      // },
    },
  ],
  clickUrl: {
    type: String,
    default: null,
  },
});

BrandBlockSchema.pre("save", async function (next) {
  if (this.orderNum != null) return next();
  try {
    const lastDoc = await mongoose
      .model("BrandBlock")
      .findOne({})
      .sort({ orderNum: -1 })
      .select("orderNum");

    this.orderNum = lastDoc ? lastDoc.orderNum + 1 : 1;
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("BrandBlock", BrandBlockSchema);
