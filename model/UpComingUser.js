const mongoose = require("mongoose");
const validator = require("validator");
const UpComingUserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please add a name"],
      trim: true,
      maxlength: [50, "Name can not be more than 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Please add an email"],
      unique: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please add a valid email",
      ],
    },
    phone: {
      type: String,
      match: [/^\+?[1-9]\d{1,14}$/, "Please add a valid phone number"],
    },
  },
  { timestamps: true }
);
module.exports = mongoose.model("UpComingUser", UpComingUserSchema);
