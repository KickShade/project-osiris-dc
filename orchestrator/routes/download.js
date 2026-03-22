const express = require('express');
const router = express.Router();
const { reassembleFile } = require('../lib/sharding');
const nodeClient = require('../lib/nodeClient');
const metadataClient = require('../lib/metadataClient');

/**
 * GET /download/:fileId
 * Process: Fetch Recipe -> Gather Shards -> Sort -> Reassemble -> Stream
 */
router.get('/:fileId', async (req, res, next) => {
    try {
        const { fileId } = req.params;

        // 1. Retrieve the file metadata (the recipe) from the Metadata Service
        const fileMetadata = await metadataClient.getFileMetadata(fileId);
        
        if (!fileMetadata || !fileMetadata.shards) {
            return res.status(404).json({ error: 'File metadata not found.' });
        }

        const { fileName, mimeType, shards } = fileMetadata;

        // 2. Fetch all shards from the Storage Manager Node in parallel
        const fetchPromises = shards.map(async (shardInfo) => {
            const buffer = await nodeClient.fetchShard(shardInfo.shardId);
            return {
                data: buffer,
                sequence: shardInfo.sequence
            };
        });

        const retrievedShards = await Promise.all(fetchPromises);

        // 3. Sort the shards into the correct sequence
        // We initialize a fixed-size array to ensure O(1) placement by index
        const orderedShards = new Array(shards.length);
        retrievedShards.forEach(shard => {
            orderedShards[shard.sequence] = shard.data;
        });

        // 4. Reassemble the sorted buffers using lib/sharding.js
        const completeFile = reassembleFile(orderedShards);

        // 5. Set headers and stream the binary file back to the client
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(completeFile);

    } catch (error) {
        console.error(`[Download Error]: ${error.message}`);
        next(error);
    }
});

module.exports = router;