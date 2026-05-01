const courseRecommendationModel = require("../models/courseRecommendationIGP");

module.exports.updateTenthPercentileRp = async function updateTenthPercentileRp(req, res) {
  try {
    const { courseId } = req.body || {};

    const result = await courseRecommendationModel.updateTenthPercentileRp(courseId);

    return res.status(200).json({
      message: "tenth_percentile_rp updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error updating tenth_percentile_rp:", error);

    return res.status(500).json({
      message: "Failed to update tenth_percentile_rp",
      error: error.message,
    });
  }
};

module.exports.getEligibleCoursesForUser = async function getEligibleCoursesForUser(req, res) {
  try {
    const { userId, difference, limit, uni_code } = req.query;

    const result = await courseRecommendationModel.getEligibleCoursesForUser(
      userId,
      difference,
      limit,
      uni_code
    );

    return res.status(200).json({
      message: "Eligible courses retrieved successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error retrieving eligible courses:", error);

    return res.status(500).json({
      message: "Failed to retrieve eligible courses",
      error: error.message,
    });
  }
};