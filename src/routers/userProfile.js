const express = require("express");
const router = express.Router();

const userProfileController = require("../controller/userProfileController");

router.get("/:userId/profile", userProfileController.getUserProfile);

module.exports = router;