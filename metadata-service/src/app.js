const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
app.use(express.json());

// Routes
app.use("/metadata", require("./routes/metadata"));
app.use("/nodes", require("./routes/nodes"));
app.use("/config", require("./routes/config"));

// DB Connect
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.log(err));

// Health check
app.get("/", (req, res) => {
    res.send("Metadata Service Running");
});

app.listen(process.env.PORT, () =>
    console.log(`Server running on ${process.env.PORT}`)
);