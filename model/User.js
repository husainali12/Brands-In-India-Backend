const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      // required: [true, "Please add a name"],
      trim: true,
      maxlength: [50, "Name can not be more than 50 characters"],
    },
    email: {
      type: String,
      // required: [true, "Please add an email"],
      unique: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please add a valid email",
      ],
    },
    phone: {
      type: String,
      match: [/^\+?[1-9]\d{1,14}$/, "Please add a valid phone number"],
      unique: true,
    },
    photo: {
      type: String,
      // required: [true, "Photo URL is required"],
    },
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
    },
    firebaseSignInProvider: {
      type: String,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    blockReasons: [{ type: String }],
    isSubscriptionActive: { type: Boolean, default: false },
    // isDeleted: {
    //   type: Boolean,
    //   default: false,
    // },
    // isActive: {
    //   type: Boolean,
    //   default: true,
    // },
    // isVerified: {
    //   type: Boolean,
    //   default: false,
    // },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", UserSchema);
