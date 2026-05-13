const express = require("express");
const router = express.Router();

const courseController = require("../controller/courseController");

router.get("/", courseController.getAllCourses);

module.exports = router;