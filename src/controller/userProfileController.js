const userProfileModel = require("../models/userProfile");

module.exports.getUserProfile = async function getUserProfile(req, res) {
  try {
    const result = await userProfileModel.getUserProfile(req.params.userId);

    if (!result) {
      return res.status(404).json({ message: "User profile not found" });
    }

    return res.status(200).json({
      message: "User profile retrieved successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error retrieving user profile:", error);

    return res.status(500).json({
      message: "Failed to retrieve user profile",
      error: error.message,
    });
  }
};