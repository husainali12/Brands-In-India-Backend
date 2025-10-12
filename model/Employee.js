const mongoose = require("mongoose");

const EmployeeSchema = new mongoose.Schema({
  empId: {
    type: String,
  },
  name: {
    type: String,
  },
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BrandBlock",
  },
});

module.exports = mongoose.model("Employee", EmployeeSchema);
