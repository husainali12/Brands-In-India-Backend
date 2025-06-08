const crypto = require("crypto");
const config = require("../config/config");

const orderId = "order_QefDTYuAF13lcQ";
const paymentId = "pay_ABCdef012345";
const keySecret = config.razorpay.keySecret;

const signature = crypto
  .createHmac("sha256", keySecret)
  .update(`${orderId}|${paymentId}`)
  .digest("hex");

console.log("Signature:  ", signature);