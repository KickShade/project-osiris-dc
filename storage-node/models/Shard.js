const mongoose = require('mongoose');

const shardSchema = new mongoose.Schema({
  shard_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  file_id: {
    type: String,
    required: true,
    index: true
  },
  data: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Shard', shardSchema);