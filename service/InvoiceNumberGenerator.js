const SubscriptionInvoice = require("../model/subscriptionInvoiceSchema");
const getFinancialYear = (value) => {
  if (!value) return "";

  let date;

  if (typeof value === "number") {
    date = new Date(value * 1000);
  } else {
    date = new Date(value);
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  return month < 4
    ? `${year - 1}-${String(year).slice(-2)}`
    : `${year}-${String(year + 1).slice(-2)}`;
};

const generateInvoiceNumber = async (subscriptionId, paidAt) => {
  const financialYear = getFinancialYear(paidAt);

  const lastInvoice = await SubscriptionInvoice.findOne({
    financial_year: financialYear,
  }).sort({ invoice_sequence: -1 });

  const nextSequence = lastInvoice ? lastInvoice.invoice_sequence + 1 : 1;

  const previousInvoices = await SubscriptionInvoice.find({
    subscription_id: subscriptionId,
    financial_year: financialYear,
  }).sort({ paid_at: 1 });

  let invoiceNumber = "";
  let subSeq = 0;

  if (previousInvoices.length === 0) {
    invoiceNumber = `BII/${financialYear}/${String(nextSequence).padStart(2, "0")}`;
  } else {
    const base = previousInvoices[0].invoice_number;
    subSeq = previousInvoices.length;
    invoiceNumber = `${base}.${subSeq}`;
  }

  return {
    invoiceNumber,
    invoiceSequence: nextSequence,
    invoiceSubSequence: subSeq,
    financialYear,
  };
};

module.exports = { generateInvoiceNumber };
