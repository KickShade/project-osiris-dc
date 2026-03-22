/*
The orchestrator/lib/healthCheck.js serves as a background monitoring service. Instead of 
waiting for a user to attempt an upload or download only to find a service is down, this 
utility periodically pings the Storage Manager and the Metadata Service. It maintains 
an internal "state" that the routes can check before starting heavy data operations.
*/

const axios = require('axios');

/**
 * Background utility to monitor the health of internal services.
 */

const services = {
    metadata: process.env.METADATA_SERVICE_URL,
    storageManager: process.env.STORAGE_MANAGER_URL
};

// Internal state of service availability
let healthStatus = {
    metadata: false,
    storageManager: false,
    lastChecked: null
};

/**
 * Pings a specific service URL to check connectivity.
 * @param {string} url - The base URL of the service.
 * @returns {Promise<boolean>}
 */
const checkService = async (url) => {
    if (!url) return false;
    try {
        // We use a timeout to ensure the orchestrator isn't hung by a slow service
        await axios.get(`${url}/health`, { timeout: 5000 });
        return true;
    } catch (error) {
        return false;
    }
};

/**
 * Updates the global health status by checking all registered services.
 */
const runHealthCheck = async () => {
    const [metadataAlive, storageAlive] = await Promise.all([
        checkService(services.metadata),
        checkService(services.storageManager)
    ]);

    healthStatus = {
        metadata: metadataAlive,
        storageManager: storageAlive,
        lastChecked: new Date().toISOString()
    };

    if (!metadataAlive || !storageAlive) {
        console.warn(`[Health Warning]: One or more services are unreachable. Status:`, healthStatus);
    }
};

/**
 * Returns the current cached health status.
 * @returns {Object}
 */
const getStatus = () => healthStatus;

/**
 * Starts the periodic health check interval.
 * @param {number} intervalMs - Frequency of checks in milliseconds (default 30s).
 */
const startMonitoring = (intervalMs = 30000) => {
    // Run immediate check on startup
    runHealthCheck();
    
    // Set periodic interval
    setInterval(runHealthCheck, intervalMs);
    console.log(`Health monitoring started. Interval: ${intervalMs}ms`);
};

module.exports = {
    startMonitoring,
    getStatus
};