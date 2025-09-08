const BlockReasons = require("../model/BlockReasons");

const seedBlockReasons = async () => {
  const reasons = [
    "Suspicious or Fraudulent Activity",
    "Excessive Bot or Scraping Behavior",
    "Unusual Traffic or Rate Limiting",
    "Violation of Terms of Service",
    "Security Threats or Hacking Attempts",
  ];

  for (const reason of reasons) {
    const exists = await BlockReasons.findOne({ reason });
    if (!exists) {
      await BlockReasons.create({ reason });
    }
  }

  console.log("✅ Block reasons seeded");
};

module.exports = seedBlockReasons;
