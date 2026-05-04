const express = require("express");
const app = express();

const gesRoutes = require("./routers/uniDataRoutes");
const courseRecommendationRoutes = require("./routers/courseRecommendationIGP");
const courseAdmissionsScoreUpdateRoutes = require("./routers/courseAdmissionScoreUpdate70rp");
const coursePriorityRecommendationRoutes = require("./routers/coursePriorityRecommendationRoutes");

app.use(express.json());
app.use("/ges", gesRoutes);
app.use("/course-recommendation", courseRecommendationRoutes);
app.use("/course-admissions-update", courseAdmissionsScoreUpdateRoutes);
app.use("/course-priority-recommendation", coursePriorityRecommendationRoutes);

module.exports = app;