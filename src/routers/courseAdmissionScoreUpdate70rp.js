const express = require("express");
const router = express.Router();
const admissionsScoreUpdateController = require("../controller/courseAdmissionScoreUpdate70rp");

router.post("/", admissionsScoreUpdateController.updateAdmissionsScoresFromGrades);

module.exports = router;