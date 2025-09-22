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
const upComingUserRoutes = require("./routes/UpComingUserRoutes");
dotenv.config();

const app = express();
mongoose
  .connect(
    process.env.MONGODB_URI || "mongodb://localhost:27017/brands-in-india"
  )
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Failed to connect to MongoDB", err));

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
  })
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

cron.schedule("0 0 * * *", async () => {
  console.log("[Cron] Clearing expired reservations...");
  try {
    const result = await GridSpace.updateMany(
      { status: "reserved", reservationExpiresAt: { $lt: new Date() } },
      { $set: { status: "available", owner: null, reservationExpiresAt: null } }
    );
    console.log(`[Cron] Expired reservations cleared: ${result.modifiedCount}`);
  } catch (e) {
    console.error("[Cron] Error clearing expired reservations:", e);
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
