const router = require("express").Router();
const Node = require("../models/Node");

// Get all active nodes
router.get("/", async (req, res) => {
    try {
        const nodes = await Node.find({ status: "active" });
        res.json(nodes);
    } catch (err) {
        res.status(500).json(err.message);
    }
});

module.exports = router;