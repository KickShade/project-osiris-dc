const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema({
    file_id: { type: String, required: true, unique: true },
    filename: { type: String, required: true },
    shards: [
        {
            shard_id: String,
            node: String   // comes from x-managed-node header
        }
    ],
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model("File", fileSchema);