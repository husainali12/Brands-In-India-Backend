const express = require('express');
const {
  createOrder,
  verifyPayment,
  getPaymentHistory,
  getTransaction
} = require('../controller/paymentController');
const firebaseAuth = require("../middleware/firebaseAuth");
const router = express.Router();

router.post('/create-order',firebaseAuth("any"), createOrder);
router.post('/verify', firebaseAuth("any"), verifyPayment);
router.get('/history', firebaseAuth("any"), getPaymentHistory);
router.get('/transaction/:id', firebaseAuth("any"), getTransaction);

module.exports = router;