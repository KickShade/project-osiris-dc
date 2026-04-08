const router = require("express").Router();
const File = require("../models/File");

// Save metadata
router.post("/", async (req, res) => {
    try {
        const { file_id, filename, shards } = req.body;

        if (!file_id || !shards || shards.length === 0) {
  return res.status(400).json({ error: "Invalid data" });
}

const file = await File.findOneAndUpdate(
  { file_id },
  { filename, shards },
  { upsert: true, new: true }
);

res.json({ message: "Metadata saved", file });


    } catch (err) {
        res.status(500).json(err.message);
    }
});

// Get metadata
router.get("/:file_id", async (req, res) => {
    try {
        const file = await File.findOne({ file_id: req.params.file_id });

        if (!file) {
  return res.status(404).json({ error: "File not found" });
}

res.json(file);


    } catch (err) {
        res.status(500).json(err.message);
    }
});

module.exports = router;
