const Razorpay = require("razorpay");
const catchAsync = require("../utils/catchAsync");
const ApiError = require("../utils/ApiError");
const config = require("../config/config");
const razorpay = new Razorpay({
  key_id: config.razorpay.keyId,
  key_secret: config.razorpay.keySecret,
});

const fetchSubscriptionInvoices = async (fromTimestamp = null) => {
  const invoices = [];
  let skip = 0;
  const count = 100;

  while (true) {
    const params = { count, skip };
    // Only fetch invoices newer than the latest already stored
    if (fromTimestamp) {
      params.from = fromTimestamp;
    }

    const response = await razorpay.invoices.all(params);
    if (!response || !response.items) {
      throw new ApiError("Failed to fetch invoices from Razorpay", 404);
    }

    if (!response.items.length) {
      break;
    }
    invoices.push(...response.items);
    skip += count;
  }
  console.log(`Fetched ${invoices.length} invoices from Razorpay (from: ${fromTimestamp ?? "all time"})`);
  return invoices.filter((inv) => inv.subscription_id && inv.status === "paid");
  //   const inv = invoices.filter(
  //     (inv) => inv.subscription_id && inv.status === "paid",
  //   );
  //   return res.status(200).json({
  //     success: true,
  //     total: inv.length,
  //     data: inv,
  //   });
};

module.exports = { fetchSubscriptionInvoices };
