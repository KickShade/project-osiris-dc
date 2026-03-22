/**
 * Logic for splitting files into shards and reassembling them.
 * This module handles the core data transformation for the orchestrator.
 */

/**
 * Splits a file buffer into a specified number of shards.
 * @param {Buffer} fileBuffer - The complete binary data of the uploaded file.
 * @param {number} shardCount - The number of shards to create.
 * @returns {Buffer[]} An array containing the file shards as Buffers.
 */
const splitFile = (fileBuffer, shardCount) => {
    const totalSize = fileBuffer.length;
    
    // Determine the size of each shard, rounding up to ensure all data is covered.
    const shardSize = Math.ceil(totalSize / shardCount);
    const shards = [];

    for (let i = 0; i < shardCount; i++) {
        const start = i * shardSize;
        const end = Math.min(start + shardSize, totalSize);
        
        // Extract a view of the buffer without copying the underlying memory
        if (start < totalSize) {
            shards.push(fileBuffer.subarray(start, end));
        } else {
            // If the file is smaller than the shard count, provide an empty buffer
            shards.push(Buffer.alloc(0));
        }
    }

    return shards;
};

/**
 * Reassembles an array of binary shards into a single file buffer.
 * @param {Buffer[]} shards - An array of buffers sorted by their original sequence.
 * @returns {Buffer} The complete, reconstructed file buffer.
 */
const reassembleFile = (shards) => {
    // Buffer.concat is highly optimized for joining multiple buffer chunks.
    return Buffer.concat(shards); // download.js manages the ordering of th eshards in the buffer. Thus concatentaion at this stage is safe and guaranteed to give the correct result.
};

module.exports = {
    splitFile,
    reassembleFile
};