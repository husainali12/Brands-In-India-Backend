const express = require("express");
const firebaseAuth = require("../middleware/firebaseAuth");
const layoutValidation = require('../validations/layout.validation');

const {
  createGridLayout,
  updateGridLayout,
  deleteGridLayout,
  updateGridSpacePrice,
  getGridLayoutsWithSpaces,
} = require("../controller/adminController");
const validate = require("../middleware/validate");
const router = express.Router();

router.use(firebaseAuth("admin"));

router.route("/layouts").post(
  validate(layoutValidation.createLayout),
  createGridLayout
);

router
  .route("/layouts/:id")
  .patch(
    updateGridLayout
  )
  .delete(deleteGridLayout);

router.put(
  "/spaces/:id/price",
    validate(layoutValidation.updateSpacePrice),
  updateGridSpacePrice
);
router
  .route("/layouts-with-spaces")
  .get(getGridLayoutsWithSpaces);

module.exports = router;
