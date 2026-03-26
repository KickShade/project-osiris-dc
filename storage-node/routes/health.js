const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

router.get('/', (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  const nodeId = process.env.NODE_ID || 'unknown_node';

  if (isConnected) {
    return res.status(200).json({
      status: "ok",
      node_id: nodeId,
      db: "connected"
    });
  } else {
    return res.status(503).json({
      status: "error",
      node_id: nodeId,
      db: "disconnected"
    });
  }
});

module.exports = router;