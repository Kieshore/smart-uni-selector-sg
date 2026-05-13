const express = require("express");
const path = require("path");
const app = express();

const gesRoutes = require("./routers/uniDataRoutes");
const courseRecommendationRoutes = require("./routers/courseRecommendationIGP");
const courseAdmissionsScoreUpdateRoutes = require("./routers/courseAdmissionScoreUpdate70rp");
const coursePriorityRecommendationRoutes = require("./routers/coursePriorityRecommendationRoutes");
const userProfileRoutes = require("./routers/userProfile");
const interestGroupRoutes = require("./routers/interestGroup");
const courseRoutes = require("./routers/course");

app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

app.use("/ges", gesRoutes);
app.use("/course-recommendation", courseRecommendationRoutes);
app.use("/course-admissions-update", courseAdmissionsScoreUpdateRoutes);
app.use("/course-priority-recommendation", coursePriorityRecommendationRoutes);
app.use("/interest-groups", interestGroupRoutes);
app.use("/users", userProfileRoutes);
app.use("/courses", courseRoutes);

app.get("/", (req, res) => {
  res.redirect("/course-finder.html");
});

module.exports = app;