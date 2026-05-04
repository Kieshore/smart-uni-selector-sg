const express = require("express");
const router = express.Router();
const coursePriorityRecommendationController = require("../controller/coursePriorityRecommendationController");

router.get(
  "/eligible-ranked-courses",
  coursePriorityRecommendationController.getRankedEligibleCoursesForUser
);

module.exports = router;