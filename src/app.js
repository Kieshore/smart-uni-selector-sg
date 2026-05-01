const express = require("express");
const app = express();

const gesRoutes = require("./routers/uniDataRoutes");
const courseRecommendationRoutes = require("./routers/courseRecommendationIGP");

app.use(express.json());
app.use("/ges", gesRoutes);
app.use("/course-recommendation", courseRecommendationRoutes);

module.exports = app;