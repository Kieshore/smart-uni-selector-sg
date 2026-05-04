const coursePriorityRecommendationModel = require("../models/coursePriorityRecommendation");

module.exports.getRankedEligibleCoursesForUser =
  async function getRankedEligibleCoursesForUser(req, res) {
    try {
      const result =
        await coursePriorityRecommendationModel.getRankedEligibleCoursesForUser(
          req.query
        );

      return res.status(200).json({
        message: "Ranked eligible courses retrieved successfully",
        data: result,
      });
    } catch (error) {
      console.error("Error retrieving ranked eligible courses:", error);

      return res.status(500).json({
        message: "Failed to retrieve ranked eligible courses",
        error: error.message,
      });
    }
  };