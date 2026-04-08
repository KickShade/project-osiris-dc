const mongoose = require("mongoose");

const nodeSchema = new mongoose.Schema({
    node_id: String,
    url: String,
    status: { type: String, default: "active" }
});

module.exports = mongoose.model("Node", nodeSchema);