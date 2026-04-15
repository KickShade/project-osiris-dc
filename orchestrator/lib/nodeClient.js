/*
The orchestrator/lib/nodeClient.js serves as the primary communication bridge between the orchestrator 
and the Storage Manager Node.
*/
const axios = require('axios');
const FormData = require('form-data');

/**
 * Abstraction layer for HTTP communication with the Storage Manager Node.
 */

const STORAGE_MANAGER_URL = process.env.STORAGE_MANAGER_URL;

/**
 * Sends a batch of shards to the Storage Manager Node.
 * @param {string} fileId - The unique identifier for the file.
 * @param {Buffer[]} shards - Array of binary buffers to be stored.
 * @returns {Promise<Object[]>} Returns the shard mapping metadata from the manager.
 */
const sendToManager = async (fileId, shards) => {
    if (!STORAGE_MANAGER_URL) {
        throw new Error('STORAGE_MANAGER_URL is not configured in environment variables.');
    }

    const form = new FormData();
    form.append('fileId', fileId);

    // Append each shard buffer to the multipart form
    shards.forEach((shardBuffer, index) => {
        form.append('shards', shardBuffer, {
            filename: `shard_${index}.bin`,
            contentType: 'application/octet-stream',
        });
    });

    try {
        const response = await axios.post(`${STORAGE_MANAGER_URL}/store`, form, {
            headers: {
                ...form.getHeaders(),
            },
            // Increase maxContentLength for large file uploads
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        // The Storage Manager should return an array of { shardId, sequence, nodeLocation }
        return response.data.shardMapping;
    } catch (error) {
        throw new Error(`Failed to dispatch shards to Storage Manager: ${error.message}`);
    }
};

/**
 * Fetches a specific binary shard from the Storage Manager.
 * @param {string} shardId - The unique ID of the shard to retrieve.
 * @returns {Promise<Buffer>} The binary data of the shard.
 */
const fetchShard = async (shardId) => {
    try {
        const response = await axios.get(`${STORAGE_MANAGER_URL}/fetch/${shardId}`, {
            responseType: 'arraybuffer'
        });

        // Convert the arraybuffer back into a Node.js Buffer for reassembly
        return Buffer.from(response.data);
    } catch (error) {
        throw new Error(`Failed to fetch shard ${shardId} from Storage Manager: ${error.message}`);
    }
};

/**
 * Retrieves topology, node load, and recent shard event telemetry from the manager.
 * @returns {Promise<Object>} Manager system status payload.
 */
const getSystemStatus = async () => {
    if (!STORAGE_MANAGER_URL) {
        throw new Error('STORAGE_MANAGER_URL is not configured in environment variables.');
    }

    try {
        const response = await axios.get(`${STORAGE_MANAGER_URL}/system-status`, {
            timeout: 10000
        });
        return response.data;
    } catch (error) {
        throw new Error(`Failed to retrieve manager system status: ${error.message}`);
    }
};

module.exports = {
    sendToManager,
    fetchShard,
    getSystemStatus
};