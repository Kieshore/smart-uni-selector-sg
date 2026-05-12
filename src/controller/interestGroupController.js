const interestGroupModel = require("../models/interestGroup");

module.exports.getAllInterestGroups = async function getAllInterestGroups(req, res) {
  try {
    const result = await interestGroupModel.getAllInterestGroups();

    return res.status(200).json({
      message: "Interest groups retrieved successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error retrieving interest groups:", error);

    return res.status(500).json({
      message: "Failed to retrieve interest groups",
      error: error.message,
    });
  }
};