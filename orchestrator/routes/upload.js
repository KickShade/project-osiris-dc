const express = require('express');
const router = express.Router();
const multer = require('multer');
const { randomUUID } = require('crypto');
const { splitFile } = require('../lib/sharding');
const nodeClient = require('../lib/nodeClient');
const metadataClient = require('../lib/metadataClient');

// Configure multer to store upload in a memory buffer for immediate sharding
const storage = multer.memoryStorage(); 
const upload = multer({ storage: storage });

/**
 * POST /upload
 * Process: Receive -> Shard -> Dispatch to Manager -> Register Metadata
 */
router.post('/', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file provided in the request.' });
        }

        const fileId = randomUUID();
        const fileName = req.file.originalname;
        const mimeType = req.file.mimetype;
        const fileBuffer = req.file.buffer;

        // Retrieve shard count from environment variables
        const shardCount = parseInt(process.env.DEFAULT_SHARD_COUNT) || 3;

        // 1. Execute sharding logic from lib/sharding.js
        const shards = splitFile(fileBuffer, shardCount);

        // 2. Dispatch shards to the Storage Manager Node
        // The manager returns the finalized mapping of where shards are stored
        const shardMapping = await nodeClient.sendToManager(fileId, shards);

        // 3. Register the file and its shard sequence in the Metadata Service
        await metadataClient.registerFile({
            fileId,
            fileName,
            mimeType,
            totalSize: fileBuffer.length,
            shards: shardMapping // Array of { shardId, nodeLocation, sequence }
        });

        res.status(201).json({
            message: 'File successfully sharded and stored.',
            fileId,
            fileName,
            shardsProcessed: shards.length
        });

    } catch (error) {
        console.error(`[Upload Error]: ${error.message}`);
        next(error);
    }
});

module.exports = router;