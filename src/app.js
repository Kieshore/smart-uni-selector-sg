const express = require("express");
const app = express();

const gesRoutes = require("./routers/uniDataRoutes");

app.use(express.json());
app.use("/ges", gesRoutes);

module.exports = app;