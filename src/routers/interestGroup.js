const express = require("express");
const router = express.Router();
const interestGroupController = require("../controller/interestGroupController");

router.get("/", interestGroupController.getAllInterestGroups);

module.exports = router;