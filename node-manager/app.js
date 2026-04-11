const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const multer = require('multer');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 4000;
const upload = multer({ storage: multer.memoryStorage() });

// Default list of storage node URLs used when STORAGE_NODES is not provided.
const defaultStorageNodes = [
  'https://osiris-storage-node-a.onrender.com',
  'https://osiris-storage-node-b.onrender.com',
  'https://osiris-storage-node-c.onrender.com'
];

// Optional override, example: STORAGE_NODES=http://host.docker.internal:3001,http://localhost:3002
const configuredStorageNodes = process.env.STORAGE_NODES
  ? process.env.STORAGE_NODES.split(',').map((node) => node.trim()).filter(Boolean)
  : [];

// In local development, include a local storage-node fallback when no override is provided.
const localFallbackNodes = configuredStorageNodes.length > 0
  ? []
  : ['http://host.docker.internal:3001', 'http://localhost:3001'];

const storageNodes = [...new Set([...configuredStorageNodes, ...defaultStorageNodes, ...localFallbackNodes])];

let healthyNodes = [...storageNodes];
const shardLocationIndex = new Map();

app.use(express.json({ limit: '50mb' }));

function getNodePool() {
  return healthyNodes.length > 0 ? healthyNodes : storageNodes;
}

// 1. Health Check Loop: Runs every 30 seconds to update the "Healthy" list
const updateHealthyNodes = async () => {
  const statusChecks = await Promise.allSettled(
    storageNodes.map(node => axios.get(`${node}/health`, { timeout: 3000 }))
  );

  healthyNodes = storageNodes.filter((node, index) => {
    const res = statusChecks[index];
    return res.status === 'fulfilled' && res.value.data.db === 'connected';
  });

  console.log(`[Manager] Healthy nodes updated: ${healthyNodes.length}/${storageNodes.length}`);
};

setInterval(updateHealthyNodes, 30000); 
updateHealthyNodes(); // Initial check on startup

// 2. Store endpoint expected by orchestrator
app.post('/store', upload.array('shards'), async (req, res) => {
  try {
    const fileId = req.body.fileId;
    const shards = req.files || [];

    if (!fileId || shards.length === 0) {
      return res.status(400).json({ error: 'fileId and shards are required.' });
    }

    const nodePool = getNodePool();
    if (nodePool.length === 0) {
      return res.status(503).json({ error: 'All storage nodes are currently offline.' });
    }

    const shardMapping = [];

    for (let index = 0; index < shards.length; index += 1) {
      const shardFile = shards[index];
      const target = nodePool[current % nodePool.length];
      current += 1;

      const shardId = `${fileId}-${index}-${randomUUID().slice(0, 8)}`;

      await axios.post(
        `${target}/shard`,
        {
          shard_id: shardId,
          file_id: fileId,
          data: shardFile.buffer.toString('base64')
        },
        {
          timeout: 10000
        }
      );

      shardLocationIndex.set(shardId, target);
      shardMapping.push({
        shardId,
        sequence: index,
        nodeLocation: target
      });
    }

    return res.status(201).json({ shardMapping });
  } catch (error) {
    return res.status(500).json({ error: `Failed to store shards: ${error.message}` });
  }
});

// 3. Fetch endpoint expected by orchestrator
app.get('/fetch/:shardId', async (req, res) => {
  const { shardId } = req.params;
  const preferredNode = shardLocationIndex.get(shardId);

  const pool = getNodePool();
  const nodesToTry = preferredNode
    ? [preferredNode, ...pool.filter((node) => node !== preferredNode)]
    : pool;

  if (nodesToTry.length === 0) {
    return res.status(503).json({ error: 'All storage nodes are currently offline.' });
  }

  for (const node of nodesToTry) {
    try {
      const response = await axios.get(`${node}/shard/${encodeURIComponent(shardId)}`, {
        timeout: 10000
      });

      const payload = response.data || {};
      if (!payload.data) {
        continue;
      }

      const shardBuffer = Buffer.from(payload.data, 'base64');
      shardLocationIndex.set(shardId, node);

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('x-managed-node', node);
      return res.status(200).send(shardBuffer);
    } catch (error) {
      if (error.response && error.response.status === 404) {
        continue;
      }
    }
  }

  return res.status(404).json({ error: 'Shard not found.' });
});

// 4. Legacy round-robin proxy route
let current = 0;
app.use('/shard', (req, res, next) => {
  if (healthyNodes.length === 0) {
    return res.status(503).json({ error: "All storage nodes are currently offline." });
  }

  // Pick next healthy node
  const target = healthyNodes[current % healthyNodes.length];
  current++;

  console.log(`[Proxy] Routing ${req.method} to ${target}`);

  createProxyMiddleware({
    target: target,
    changeOrigin: true,
    onProxyRes: (proxyRes) => {
      // Add a header so M1 knows which specific node handled the request
      proxyRes.headers['x-managed-node'] = target;
    }
  })(req, res, next);
});

// 5. Manager's own health check
app.get('/manager-status', (req, res) => {
  res.json({ status: "online", healthy_count: healthyNodes.length, nodes: healthyNodes });
});

app.listen(PORT, () => console.log(`Node Manager active on port ${PORT}`));