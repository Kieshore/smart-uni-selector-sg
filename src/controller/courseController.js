const courseModel = require("../models/course");

module.exports.getAllCourses = async function getAllCourses(req, res) {
  try {
    const result = await courseModel.getAllCourses(req.query.search || "");

    return res.status(200).json({
      message: "Courses retrieved successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error retrieving courses:", error);

    return res.status(500).json({
      message: "Failed to retrieve courses",
      error: error.message,
    });
  }
};