const mongoose = require("mongoose");
const BlockReasonsSchema = new mongoose.Schema(
  {
    reason: {
      type: String,
      enum: [
        "Suspicious or Fraudulent Activity",
        "Excessive Bot or Scraping Behavior",
        "Unusual Traffic or Rate Limiting",
        "Violation of Terms of Service",
        "Security Threats or Hacking Attempts",
      ],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);
module.exports = mongoose.model("BlockReasons", BlockReasonsSchema);
