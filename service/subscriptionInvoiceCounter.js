const SubscriptionInvoice = require("../model/subscriptionInvoiceSchema");

const getNextSubscriptionInvoiceCount = async (subscriptionId) => {
  const lastInvoice = await SubscriptionInvoice.findOne({
    subscription_id: subscriptionId,
  }).sort({ subscription_invoice_count: -1 });

  return lastInvoice ? lastInvoice.subscription_invoice_count + 1 : 1;
};

module.exports = { getNextSubscriptionInvoiceCount };
