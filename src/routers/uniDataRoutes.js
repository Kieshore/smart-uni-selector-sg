const express = require("express");
const router = express.Router();
const gesController = require("../controller/getUniData");

router.post("/sync", gesController.syncGESOutcomes);

module.exports = router;