const express = require('express');
const router = express.Router();
const nodeClient = require('../lib/nodeClient');

/**
 * GET /system-status
 * Provides topology and shard-flow telemetry for the frontend system dashboard.
 */
router.get('/', async (req, res, next) => {
    try {
        const managerStatus = await nodeClient.getSystemStatus();

        res.status(200).json({
            source: 'orchestrator',
            ...managerStatus
        });
    } catch (error) {
        console.error(`[System Status Error]: ${error.message}`);
        next(error);
    }
});

module.exports = router;
