/*
The orchestrator/lib/metadataClient.js is the "Bookkeeper" of the system. It is responsible 
for storing and retrieving the file "recipes" that allow the orchestrator to know exactly 
which shards to ask the Storage Manager for and in what specific order.
*/
const axios = require('axios');

/**
 * Abstraction layer for HTTP communication with the Metadata Service.
 * This service tracks the mapping between File IDs and Shard IDs/Sequences.
 */

const METADATA_SERVICE_URL = process.env.METADATA_SERVICE_URL;

/**
 * Registers a new file and its shard mapping in the Metadata Service.
 * @param {Object} fileData - The file details and shard array.
 * @param {string} fileData.fileId - Unique file identifier.
 * @param {string} fileData.fileName - Original name of the file.
 * @param {string} fileData.mimeType - File content type (e.g., image/png).
 * @param {number} fileData.totalSize - Size of the file in bytes.
 * @param {Object[]} fileData.shards - Array of { shardId, sequence, nodeLocation }.
 */
const registerFile = async (fileData) => {
    try {
        const response = await axios.post(`${METADATA_SERVICE_URL}/files`, fileData);
        return response.data;
    } catch (error) {
        throw new Error(`Metadata Registration Failed: ${error.message}`);
    }
};

/**
 * Retrieves the specific metadata ("recipe") for a file.
 * @param {string} fileId - The unique ID of the file to look up.
 * @returns {Promise<Object>} The file metadata including the shard list.
 */
const getFileMetadata = async (fileId) => {
    try {
        const response = await axios.get(`${METADATA_SERVICE_URL}/files/${fileId}`);
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return null;
        }
        throw new Error(`Failed to retrieve metadata for file ${fileId}: ${error.message}`);
    }
};

/**
 * Fetches the complete list of all files registered in the system.
 * @returns {Promise<Object[]>}
 */
const getAllFiles = async () => {
    try {
        const response = await axios.get(`${METADATA_SERVICE_URL}/files`);
        return response.data; // Expected to be an array of file objects
    } catch (error) {
        throw new Error(`Failed to fetch file list: ${error.message}`);
    }
};

/**
 * Deletes the metadata record for a specific file.
 * @param {string} fileId - The unique ID of the file to remove.
 */
const deleteFileMetadata = async (fileId) => {
    try {
        await axios.delete(`${METADATA_SERVICE_URL}/files/${fileId}`);
    } catch (error) {
        throw new Error(`Failed to delete metadata for file ${fileId}: ${error.message}`);
    }
};

module.exports = {
    registerFile,
    getFileMetadata,
    getAllFiles,
    deleteFileMetadata
};