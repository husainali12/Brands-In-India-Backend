const crypto = require("crypto");
const config = require("../config/config");

const orderId = "order_QNH37vas8d8zAI";
const paymentId = "pay_MOCKPAYMENT12345";
const keySecret = config.razorpay.keySecret;

const signature = crypto
  .createHmac("sha256", keySecret)
  .update(`${orderId}|${paymentId}`)
  .digest("hex");

console.log("Signature:  ", signature);
