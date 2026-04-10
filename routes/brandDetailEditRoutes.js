const express = require("express");
const {
  updateBrandDetailsById,
  uploadBrandImages,
  uploadProductImages,
  getbrandDetailsById,
  deleteBrandImages,
  deleteProductImage,
} = require("../controller/brandDetailEditController");
const firebaseAuth = require("../middleware/firebaseAuth");
const router = express.Router();
router.post("/brandImages", firebaseAuth("any"), uploadBrandImages);
router.post("/brandProductImages", firebaseAuth("any"), uploadProductImages);
router.delete("/brandImages/:id", firebaseAuth("any"), deleteBrandImages);
router.delete(
  "/brandProductImages/:id",
  firebaseAuth("any"),
  deleteProductImage,
);
router.patch("/brandDetails/:id", firebaseAuth("any"), updateBrandDetailsById);
router.route("/:id").get(getbrandDetailsById);
module.exports = router;
