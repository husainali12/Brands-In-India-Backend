const mongoose = require("mongoose");
const subscriptionInvoiceSchema = new mongoose.Schema(
  {
    amount: Number,
    amount_paid: Number,
    billing_end: {
      type: Date,
      set: (value) => {
        // If value is in seconds, convert to milliseconds
        if (typeof value === "number") {
          return new Date(value * 1000);
        }
        return value;
      },
    },
    billing_start: {
      type: Date,
      set: (value) => {
        // If value is in seconds, convert to milliseconds
        if (typeof value === "number") {
          return new Date(value * 1000);
        }
        return value;
      },
    },
    created_at: {
      type: Date,
      set: (value) => {
        // If value is in seconds, convert to milliseconds
        if (typeof value === "number") {
          return new Date(value * 1000);
        }
        return value;
      },
    },
    currency: String,
    currency_symbol: String,
    customer_details: {
      billing_address: String,
      contact: String,
      customer_email: String,
      customer_name: String,
      emaild: String,
      gstin: String,
      id: String,
      name: String,
      shipping_address: String,
    },
    date: {
      type: Date,
      set: (value) => {
        // If value is in seconds, convert to milliseconds
        if (typeof value === "number") {
          return new Date(value * 1000);
        }
        return value;
      },
    },
    entity: String,
    gross_amount: Number,
    inv_id: String,
    issued_at: {
      type: Date,
      set: (value) => {
        // If value is in seconds, convert to milliseconds
        if (typeof value === "number") {
          return new Date(value * 1000);
        }
        return value;
      },
    },
    line_items: [
      {
        amount: Number,
        description: String,
        currency: String,
        gross_amount: Number,
        li_id: String,
        name: String,
        net_amount: Number,
        quantity: Number,
        taxable_amount: Number,
        unit_amount: Number,
      },
    ],
    order_id: String,
    paid_at: {
      type: Date,
      set: (value) => {
        if (typeof value === "number") {
          return new Date(value * 1000);
        }
        return value;
      },
    },
    payment_id: String,
    short_url: String,
    status: {
      type: String,
      enum: [
        "paid",
        "draft",
        "issued",
        "partially_paid",
        "cancelled",
        "expired",
        "deleted",
      ],
    },
    subscription_invoice_count: {
      type: Number,
    },
    subscription_id: String,
    invoice_number: {
      type: String,
      unique: true,
    },

    invoice_sequence: {
      type: Number,
    },

    invoice_sub_sequence: {
      type: Number, // 0,1,2,3...
      default: 0,
    },

    financial_year: {
      type: String,
    },
  },
  { timestamps: true },
);
module.exports = mongoose.model(
  "SubscriptionInvoiceSchema",
  subscriptionInvoiceSchema,
);
