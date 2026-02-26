const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const path = require("path");
const fileUpload = require("express-fileupload");
const cron = require("node-cron");
const GridSpace = require("./model/GridSpace");

const authRoutes = require("./routes/authRoutes");
const gridRoutes = require("./routes/gridRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const adminRoutes = require("./routes/adminRoutes");
const biddingRoutes = require("./routes/biddingRoutes");
const brandRoutes = require("./routes/brandRoutes");
const blockReasonsRoutes = require("./routes/blockReasonsRoutes");
const panelRoute = require("./routes/panelRoutes");
const brandInvoiceRoutes = require("./routes/brandInvoiceRoutes");
const upComingUserRoutes = require("./routes/UpComingUserRoutes");
const viewRoutes = require("./routes/viewRoutes");
const exportListRoutes = require("./routes/exportListRoutes");
const syncInvoice = require("./routes/syncInvoiceroute");
const {
  syncSubscriptionInvoicesService,
} = require("./service/invoiceSyncService");
const employeeRoutes = require("./routes/employeeRoutes");
const brandDetailRoutes = require("./routes/brandDetailEditRoutes");

const app = express();
mongoose
  .connect(
    process.env.MONGODB_URI || "mongodb://localhost:27017/brands-in-india",
  )
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Failed to connect to MongoDB", err));

app.use(cors());
app.use(morgan("dev"));
// Exclude webhook route from JSON parsing to preserve raw body for signature verification
const jsonParser = express.json();
app.use((req, res, next) => {
  if (req.path === "/api/brand/webhook") {
    return next();
  }
  jsonParser(req, res, next);
});
app.use(express.urlencoded({ extended: true }));
app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
  }),
);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/grid", gridRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/bid", biddingRoutes);
app.use("/api/brand", brandRoutes);
app.use("/api/blockReasons", blockReasonsRoutes);
app.use("/api/upcoming-user", upComingUserRoutes);
app.use("/api/panel", panelRoute);
app.use("/api/employee", employeeRoutes);
app.use("/api/brand-detail", brandDetailRoutes);
app.use("/api/sync", syncInvoice);
app.use("/api/brandList", exportListRoutes);
app.use("/api/view", viewRoutes);
app.use("/api/brand-invoice", brandInvoiceRoutes);
cron.schedule("0 0 * * *", async () => {
  console.log("[Cron] Clearing expired reservations...");
  try {
    const result = await GridSpace.updateMany(
      { status: "reserved", reservationExpiresAt: { $lt: new Date() } },
      {
        $set: { status: "available", owner: null, reservationExpiresAt: null },
      },
    );
    console.log(`[Cron] Expired reservations cleared: ${result.modifiedCount}`);
  } catch (e) {
    console.error("[Cron] Error clearing expired reservations:", e);
  }
});
cron.schedule("0 1 * * *", async () => {
  console.log("[CRON] Running and syncing subscription invoice...");
  try {
    const result = await syncSubscriptionInvoicesService();
    console.log("[CRON] Invoice Sync Success:", result);
  } catch (error) {
    console.error("[CRON] Invoice Sync Failed:", error.message);
  }
});
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: err.message || "Internal Server Error",
  });
});

module.exports = app;
