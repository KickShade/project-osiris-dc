const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables from .env
dotenv.config();

// Import Routes
const uploadRoutes = require('./routes/upload');
const downloadRoutes = require('./routes/download');
const fileRoutes = require('./routes/files');
const systemStatusRoutes = require('./routes/systemStatus');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    exposedHeaders: ['Content-Disposition']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoint (Basic)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'Orchestrator is running' });
});

// Mount Routes
app.use('/upload', uploadRoutes);
app.use('/download', downloadRoutes);
app.use('/files', fileRoutes);
app.use('/system-status', systemStatusRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(`[Error]: ${err.message}`);
    res.status(err.status || 500).json({
        error: {
            message: err.message || 'Internal Server Error'
        }
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Orchestrator service listening on port ${PORT}`);
});

module.exports = app;