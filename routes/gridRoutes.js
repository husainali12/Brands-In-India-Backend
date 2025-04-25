const express = require("express");
const router = express.Router();
const firebaseAuth = require("../middleware/firebaseAuth");
const {
  getGridLayouts,
  getGridLayout,
  getGridSpaces,
  getGridSpace,
  recordGridSpaceClick,
  getMyGridSpaces,
  getGridSpaceAnalytics,
  reserveGridSpace,
} = require("../controller/gridController");

router.get("/layouts", firebaseAuth("any"), getGridLayouts);
router.get("/layouts/:id", firebaseAuth("any"), getGridLayout);
router.get("/spaces", firebaseAuth("any"), getGridSpaces);
router.get("/spaces/:id", firebaseAuth("any"), getGridSpace);
router.post("/spaces/:id/click", firebaseAuth("any"), recordGridSpaceClick);
router.get("/my-spaces", firebaseAuth("any"), getMyGridSpaces);
router.get("/spaces/:id/analytics", firebaseAuth("any"), getGridSpaceAnalytics);
router.post("/gridspaces/:id/reserve", firebaseAuth("any"), reserveGridSpace);

module.exports = router;
