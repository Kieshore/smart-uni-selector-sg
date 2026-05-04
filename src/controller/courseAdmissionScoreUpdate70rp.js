const admissionsScoreUpdateModel = require("../models/courseAdmissionScoreUpdate70rp");

module.exports.updateAdmissionsScoresFromGrades = async function updateAdmissionsScoresFromGrades(req, res) {
  try {
    const { courseId } = req.body || {};

    const result = await admissionsScoreUpdateModel.updateAdmissionsScoresFromGrades(courseId);

    return res.status(200).json({
      message: "Admissions legacy RP and UAS 70 updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error updating admissions scores:", error);

    return res.status(500).json({
      message: "Failed to update admissions scores",
      error: error.message,
    });
  }
};