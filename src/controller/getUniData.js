const gesModel = require("../models/gesOutcome");

module.exports.syncGESOutcomes = async function syncGESOutcomes(req, res) {
  try {
    const result = await gesModel.syncGESOutcomes();

    res.status(200).json({
      message: "GES sync completed",
      result,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};