const express = require("express");
const {
  uploadGridImage,
  deleteGridImage,
  editGridSpace,
} = require("../controller/uploadController");
const firebaseAuth = require("../middleware/firebaseAuth");
const router = express.Router();

router.post("/:id", firebaseAuth("any"), uploadGridImage);
router.delete("/:id", firebaseAuth("any"), deleteGridImage);

router.patch("/:id", firebaseAuth("any"), editGridSpace);

module.exports = router;
