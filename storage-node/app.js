require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const shardRoutes = require('./routes/shards');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Routes
app.use('/shard', shardRoutes); // Note: handles both /shard and /shards based on router definitions
app.use('/shards', shardRoutes); 
app.use('/health', healthRoutes);

// MongoDB Connection
mongoose.connect(MONGO_URI, { 
  serverSelectionTimeoutMS: 5000 
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Start Server
app.listen(PORT, () => {
  console.log(`Storage Node [${process.env.NODE_ID}] running on port ${PORT}`);
});