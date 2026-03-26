const express = require('express');
const router = express.Router();
const Shard = require('../models/Shard');

// POST /shard - Store a new shard
router.post('/', async (req, res) => {
  try {
    const { shard_id, file_id, data } = req.body;

    if (!shard_id || !file_id || !data) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const newShard = new Shard({ shard_id, file_id, data });
    await newShard.save();

    res.status(201).json({
      stored: true,
      shard_id: shard_id
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "shard already exists" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /shard/:shard_id - Retrieve a shard
router.get('/:shard_id', async (req, res) => {
  try {
    const shard = await Shard.findOne({ shard_id: req.params.shard_id });
    
    if (!shard) {
      return res.status(404).json({ error: "shard not found" });
    }

    res.status(200).json({
      shard_id: shard.shard_id,
      data: shard.data
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /shard/:shard_id - Delete a shard
router.delete('/:shard_id', async (req, res) => {
  try {
    const result = await Shard.findOneAndDelete({ shard_id: req.params.shard_id });
    
    if (!result) {
      return res.status(404).json({ error: "shard not found" });
    }

    res.status(200).json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /shards?file_id=xxx - Optional cleanup helper
router.get('/', async (req, res) => {
  try {
    const { file_id } = req.query;
    if (!file_id) {
      return res.status(400).json({ error: "file_id query parameter required" });
    }

    const shards = await Shard.find({ file_id }).select('shard_id');
    res.status(200).json({
      shards: shards.map(s => s.shard_id)
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;