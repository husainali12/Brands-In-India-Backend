const SubscriptionInvoice = require("../model/subscriptionInvoiceSchema");
const { fetchSubscriptionInvoices } = require("../service/razorpayservice");
const { generateInvoiceNumber } = require("../service/InvoiceNumberGenerator");
const {
  getNextSubscriptionInvoiceCount,
} = require("../service/subscriptionInvoiceCounter");
const catchAsync = require("../utils/catchAsync");
const ApiError = require("../utils/ApiError");

const syncSubscriptionInvoices = catchAsync(async (req, res) => {
  try {
    const invoices = await fetchSubscriptionInvoices();
    let paise = 100;
    let saved = 0;
    let skipped = 0;
    for (const invoice of invoices.sort((a, b) => a.paid_at - b.paid_at)) {
      const exists = await SubscriptionInvoice.findOne({ inv_id: invoice.id });
      if (exists) {
        skipped++;
        continue;
      }
      const {
        invoiceNumber,
        invoiceSequence,
        invoiceSubSequence,
        financialYear,
      } = await generateInvoiceNumber(invoice.subscription_id, invoice.paid_at);
      const subscriptionInvoiceCount = await getNextSubscriptionInvoiceCount(
        invoice.subscription_id,
      );
      await SubscriptionInvoice.create({
        inv_id: invoice.id,
        subscription_id: invoice.subscription_id,
        invoice_number: invoiceNumber,
        invoice_sequence: invoiceSequence,
        invoice_sub_sequence: invoiceSubSequence,
        financial_year: financialYear,
        subscription_invoice_count: subscriptionInvoiceCount,
        amount: invoice.amount / paise,
        amount_paid: invoice.amount_paid / paise,

        billing_start: invoice.billing_start,
        billing_end: invoice.billing_end,
        created_at: invoice.created_at,
        issued_at: invoice.issued_at,
        paid_at: invoice.paid_at,

        currency: invoice.currency,
        currency_symbol: invoice.currency_symbol,

        customer_details: {
          name: invoice.customer_details?.name,
          email: invoice.customer_details?.email,
          contact: invoice.customer_details?.contact,
          gstin: invoice.customer_details?.gstin,
        },

        order_id: invoice.order_id,
        payment_id: invoice.payment_id,
        short_url: invoice.short_url,

        status: invoice.status,

        line_items: invoice.line_items?.map((item) => ({
          name: item.name,
          amount: item.amount,
          quantity: item.quantity,
          unit_amount: item.unit_amount,
          taxable_amount: item.taxable_amount,
        })),
      });

      saved++;
    }
    return res.json({
      success: true,
      message: "Subscription invoices synced",
      saved,
      skipped,
      totalFetched: invoices.length,
    });
  } catch (error) {
    console.error("Sync Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to sync subscription invoices",
    });
  }
});

const getInvoiceBySubscriptionId = catchAsync(async (req, res) => {
  const { subscriptionId } = req.params;
  const invoices = await SubscriptionInvoice.find({
    subscription_id: subscriptionId,
  }).sort({ paid_at: 1 });
  if (!invoices.length) {
    throw new ApiError("No invoices found for this subscription", 404);
  }
  res.status(200).json({
    success: true,
    total: invoices.length,
    data: invoices,
  });
});

module.exports = { syncSubscriptionInvoices, getInvoiceBySubscriptionId };
