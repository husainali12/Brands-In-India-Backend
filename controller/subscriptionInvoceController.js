const SubscriptionInvoice = require("../model/subscriptionInvoiceSchema");
const BrandBlock = require("../model/BrandBlock");
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
  const { month, year, from, to } = req.query;
  let filter = {
    subscription_id: subscriptionId,
  };

  // ✅ Filter by specific month & year
  if (month && year) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    filter.paid_at = {
      $gte: startDate,
      $lte: endDate,
    };
  }

  // ✅ Filter by only year
  else if (year) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);

    filter.paid_at = {
      $gte: startDate,
      $lte: endDate,
    };
  }

  // ✅ Filter by custom date range
  else if (from && to) {
    filter.paid_at = {
      $gte: new Date(from),
      $lte: new Date(to),
    };
  }
  const invoices = await SubscriptionInvoice.find(filter).sort({ paid_at: 1 });
  if (!invoices.length) {
    throw new ApiError("No invoices found for this subscription", 404);
  }
  res.status(200).json({
    success: true,
    total: invoices.length,
    data: invoices,
  });
});

const getAllSubscriptionStatuses = catchAsync(async (req, res) => {
  const currentDate = new Date();
  const oneMonthAgo = new Date(currentDate);
  oneMonthAgo.setMonth(currentDate.getMonth() - 1);

  const statuses = {
    paid: [],
    pending: [],
    overdue: [],
    halted: [],
  };

  // Run aggregation to get latest invoice per subscription, fetch brand info, and project necessary fields
  const latestInvoices = await SubscriptionInvoice.aggregate([
    { $sort: { issued_at: -1 } },
    {
      $group: {
        _id: "$subscription_id",
        doc: { $first: "$$ROOT" },
      },
    },
    { $replaceRoot: { newRoot: "$doc" } },
    {
      $lookup: {
        from: "brandblocks",
        localField: "subscription_id",
        foreignField: "subscriptionId",
        as: "brandInfo",
      },
    },
    {
      $unwind: {
        path: "$brandInfo",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        subscription_id: 1,
        status: 1,
        issued_at: 1,
        paid_at: 1,
        billing_end: 1,
        amount: 1,
        currency: 1,
        contact: "$customer_details.contact",
        brandDetails: {
          brandName: "$brandInfo.brandName",
          brandEmailId: "$brandInfo.brandEmailId",
        },
      },
    },
  ]);

  latestInvoices.forEach((invoice) => {
    let currentStatus = "paid";

    if (invoice.status === "halted" || invoice.status === "cancelled") {
      currentStatus = "halted";
    } else {
      const billingEnd = invoice.billing_end
        ? new Date(invoice.billing_end)
        : new Date(invoice.paid_at);

      if (billingEnd < oneMonthAgo) {
        currentStatus = "overdue";
      } else if (billingEnd < currentDate) {
        currentStatus = "pending";
      } else {
        currentStatus = "paid";
      }
    }

    const businessDetails = {
      subscriptionId: invoice.subscription_id,
      contact: invoice.contact || "Unknown",
      status: invoice.status,
      issuedAt: invoice.issued_at,
      paidAt: invoice.paid_at,
      billingEnd: invoice.billing_end,
      amount: invoice.amount,
      currency: invoice.currency,
      brandDetails: invoice.brandDetails?.brandName ? invoice.brandDetails : null,
      computedStatus: currentStatus,
    };

    statuses[currentStatus].push(businessDetails);
  });

  res.status(200).json({
    success: true,
    data: statuses,
    summary: {
      paidCount: statuses.paid.length,
      pendingCount: statuses.pending.length,
      overdueCount: statuses.overdue.length,
      haltedCount: statuses.halted.length,
      total:
        statuses.paid.length +
        statuses.pending.length +
        statuses.overdue.length +
        statuses.halted.length,
    },
  });
});

module.exports = {
  syncSubscriptionInvoices,
  getInvoiceBySubscriptionId,
  getAllSubscriptionStatuses,
};
