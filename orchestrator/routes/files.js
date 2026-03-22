/*
The orchestrator/routes/files.js serves as the management interface. Its primary role is to act 
as a proxy between the user and the Metadata Service, allowing users to browse available files 
or check the status of a specific upload without touching the actual binary shards.
*/

const express = require('express');
const router = express.Router();
const metadataClient = require('../lib/metadataClient');

/**
 * GET /files
 * Retrieves a list of all files currently managed by the system.
 */
router.get('/', async (req, res, next) => {
    try {
        // Fetch the global file list from the Metadata Service
        const fileList = await metadataClient.getAllFiles();

        res.status(200).json({
            count: fileList.length,
            files: fileList
        });
    } catch (error) {
        console.error(`[Files List Error]: ${error.message}`);
        next(error);
    }
});

/**
 * GET /files/:fileId
 * Retrieves detailed metadata for a specific file, including shard information.
 */
router.get('/:fileId', async (req, res, next) => {
    try {
        const { fileId } = req.params;

        // Fetch detailed record for a single file
        const fileMetadata = await metadataClient.getFileMetadata(fileId);

        if (!fileMetadata) {
            return res.status(404).json({ error: 'File not found.' });
        }

        res.status(200).json(fileMetadata);
    } catch (error) {
        console.error(`[File Detail Error]: ${error.message}`);
        next(error);
    }
});

/**
 * DELETE /files/:fileId
 * Initiates a deletion request across the metadata and storage layers.
 */
router.delete('/:fileId', async (req, res, next) => {
    try {
        const { fileId } = req.params;

        // 1. Get metadata to identify which shards to delete
        const metadata = await metadataClient.getFileMetadata(fileId);
        if (!metadata) {
            return res.status(404).json({ error: 'File not found.' });
        }

        // 2. Instruct Metadata Service to remove the record
        await metadataClient.deleteFileMetadata(fileId);

        // Note: In a full implementation, you would also trigger 
        // a deletion in nodeClient to clean up shards on the storage nodes.

        res.status(200).json({
            message: `File ${fileId} and associated metadata successfully removed.`
        });
    } catch (error) {
        console.error(`[File Deletion Error]: ${error.message}`);
        next(error);
    }
});

module.exports = router;