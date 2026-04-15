const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const multer = require('multer');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 4000;
const upload = multer({ storage: multer.memoryStorage() });
const MAX_EVENT_LOG_SIZE = Number(process.env.MANAGER_EVENT_LOG_SIZE || 80);
const RECENT_ACTIVITY_WINDOW_MS = Number(process.env.MANAGER_ACTIVITY_WINDOW_MS || 15000);
const HEAVY_LOAD_THRESHOLD = Number(process.env.MANAGER_HEAVY_LOAD_THRESHOLD || 70);

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
const fileShardCountIndex = new Map();
const fileFetchProgressIndex = new Map();
const nodeStatsByUrl = new Map();
const eventLog = [];
let eventCounter = 0;
let current = 0;

app.use(express.json({ limit: '50mb' }));

function getNodePool() {
  return healthyNodes.length > 0 ? healthyNodes : storageNodes;
}

function inferNodeName(nodeUrl, fallbackIndex = 0) {
  if (!nodeUrl) {
    return `Node ${String.fromCharCode(65 + (fallbackIndex % 26))}`;
  }

  const value = String(nodeUrl).toLowerCase();
  if (value.includes('node-a') || value.includes(':3001')) {
    return 'Node A';
  }
  if (value.includes('node-b') || value.includes(':3002')) {
    return 'Node B';
  }
  if (value.includes('node-c') || value.includes(':3003')) {
    return 'Node C';
  }

  return `Node ${String.fromCharCode(65 + (fallbackIndex % 26))}`;
}

function parseFileIdFromShardId(shardId) {
  const match = String(shardId || '').match(/^(.+)-(\d+)-([a-f0-9]{8})$/i);
  return match ? match[1] : null;
}

function ensureNodeStats(nodeUrl) {
  if (!nodeStatsByUrl.has(nodeUrl)) {
    nodeStatsByUrl.set(nodeUrl, {
      storeCount: 0,
      fetchCount: 0,
      activeStores: 0,
      activeFetches: 0,
      recentEventTimes: [],
      lastDirection: 'idle',
      lastEventAt: null
    });
  }

  return nodeStatsByUrl.get(nodeUrl);
}

function trimRecentTimes(stats) {
  const threshold = Date.now() - RECENT_ACTIVITY_WINDOW_MS;
  stats.recentEventTimes = stats.recentEventTimes.filter((time) => time >= threshold);
}

function registerNodeDirection(nodeUrl, direction) {
  const stats = ensureNodeStats(nodeUrl);
  const now = Date.now();
  stats.recentEventTimes.push(now);
  stats.lastDirection = direction;
  stats.lastEventAt = now;

  if (direction === 'receive') {
    stats.storeCount += 1;
  }

  if (direction === 'send') {
    stats.fetchCount += 1;
  }

  trimRecentTimes(stats);
}

function appendEvent(type, details = {}) {
  eventCounter += 1;
  eventLog.push({
    id: `evt-${eventCounter}`,
    type,
    timestamp: new Date().toISOString(),
    ...details
  });

  if (eventLog.length > MAX_EVENT_LOG_SIZE) {
    eventLog.shift();
  }
}

function getNodeSnapshot(nodeUrl, index) {
  const stats = ensureNodeStats(nodeUrl);
  trimRecentTimes(stats);

  const activeOps = stats.activeStores + stats.activeFetches;
  const recentOps = stats.recentEventTimes.length;
  const loadPercent = Math.min(100, activeOps * 35 + recentOps * 10);
  const isHealthy = healthyNodes.includes(nodeUrl);

  let health = 'offline';
  if (isHealthy) {
    health = loadPercent >= HEAVY_LOAD_THRESHOLD || activeOps >= 2 ? 'heavy_load' : 'stable';
  }

  let activity = 'idle';
  if (stats.activeStores > 0) {
    activity = 'receiving_shard';
  } else if (stats.activeFetches > 0) {
    activity = 'sending_shard';
  } else if (stats.lastEventAt && Date.now() - stats.lastEventAt < 8000) {
    activity = stats.lastDirection === 'receive' ? 'recent_receive' : 'recent_send';
  }

  return {
    id: `node-${index + 1}`,
    name: inferNodeName(nodeUrl, index),
    url: nodeUrl,
    health,
    loadPercent,
    activity,
    activeOperations: activeOps,
    totals: {
      stores: stats.storeCount,
      fetches: stats.fetchCount
    },
    lastEventAt: stats.lastEventAt ? new Date(stats.lastEventAt).toISOString() : null
  };
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

  storageNodes.forEach((nodeUrl) => ensureNodeStats(nodeUrl));
  appendEvent('health_snapshot', {
    healthyCount: healthyNodes.length,
    totalNodes: storageNodes.length
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
    fileShardCountIndex.set(fileId, shards.length);
    fileFetchProgressIndex.set(fileId, 0);
    appendEvent('file_sharding_started', {
      fileId,
      shardCount: shards.length
    });

    for (let index = 0; index < shards.length; index += 1) {
      const shardFile = shards[index];
      const target = nodePool[current % nodePool.length];
      current += 1;
      const targetName = inferNodeName(target, storageNodes.indexOf(target));
      const targetStats = ensureNodeStats(target);

      const shardId = `${fileId}-${index}-${randomUUID().slice(0, 8)}`;

      appendEvent('shard_dispatch_started', {
        fileId,
        shardId,
        sequence: index,
        nodeName: targetName,
        nodeUrl: target
      });

      targetStats.activeStores += 1;

      try {
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
      } finally {
        targetStats.activeStores = Math.max(0, targetStats.activeStores - 1);
      }

      registerNodeDirection(target, 'receive');
      shardLocationIndex.set(shardId, target);
      shardMapping.push({
        shardId,
        sequence: index,
        nodeLocation: target
      });

      appendEvent('shard_dispatch_completed', {
        fileId,
        shardId,
        sequence: index,
        nodeName: targetName,
        nodeUrl: target
      });
    }

    appendEvent('file_sharding_completed', {
      fileId,
      shardCount: shards.length
    });

    return res.status(201).json({ shardMapping });
  } catch (error) {
    appendEvent('file_sharding_failed', {
      fileId: req.body?.fileId || null,
      reason: error.message
    });
    return res.status(500).json({ error: `Failed to store shards: ${error.message}` });
  }
});

// 3. Fetch endpoint expected by orchestrator
app.get('/fetch/:shardId', async (req, res) => {
  const { shardId } = req.params;
  const fileId = parseFileIdFromShardId(shardId);
  const preferredNode = shardLocationIndex.get(shardId);

  const pool = getNodePool();
  const nodesToTry = preferredNode
    ? [preferredNode, ...pool.filter((node) => node !== preferredNode)]
    : pool;

  if (nodesToTry.length === 0) {
    appendEvent('shard_fetch_unavailable', {
      shardId,
      fileId
    });
    return res.status(503).json({ error: 'All storage nodes are currently offline.' });
  }

  appendEvent('recombination_requested', {
    shardId,
    fileId
  });

  for (const node of nodesToTry) {
    const nodeName = inferNodeName(node, storageNodes.indexOf(node));
    const stats = ensureNodeStats(node);

    appendEvent('shard_fetch_started', {
      shardId,
      fileId,
      nodeName,
      nodeUrl: node
    });

    stats.activeFetches += 1;

    try {
      const response = await axios.get(`${node}/shard/${encodeURIComponent(shardId)}`, {
        timeout: 10000
      });

      stats.activeFetches = Math.max(0, stats.activeFetches - 1);

      const payload = response.data || {};
      if (!payload.data) {
        continue;
      }

      const shardBuffer = Buffer.from(payload.data, 'base64');
      registerNodeDirection(node, 'send');
      shardLocationIndex.set(shardId, node);

      appendEvent('shard_fetch_completed', {
        shardId,
        fileId,
        nodeName,
        nodeUrl: node
      });

      if (fileId) {
        const knownShardCount = fileShardCountIndex.get(fileId);
        const currentProgress = (fileFetchProgressIndex.get(fileId) || 0) + 1;
        fileFetchProgressIndex.set(fileId, currentProgress);

        if (knownShardCount && currentProgress === 1) {
          appendEvent('file_recombination_started', {
            fileId,
            expectedShards: knownShardCount
          });
        }

        if (knownShardCount && currentProgress >= knownShardCount) {
          appendEvent('file_recombination_completed', {
            fileId,
            shardsFetched: currentProgress
          });
          fileFetchProgressIndex.set(fileId, 0);
        }
      }

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('x-managed-node', node);
      return res.status(200).send(shardBuffer);
    } catch (error) {
      stats.activeFetches = Math.max(0, stats.activeFetches - 1);
      if (error.response && error.response.status === 404) {
        continue;
      }
    }
  }

  appendEvent('shard_fetch_not_found', {
    shardId,
    fileId
  });

  return res.status(404).json({ error: 'Shard not found.' });
});

// Real-time topology endpoint for dashboard visualization
app.get('/system-status', (req, res) => {
  const nodeSnapshots = storageNodes.map((nodeUrl, index) => getNodeSnapshot(nodeUrl, index));
  const totalLoad = nodeSnapshots.reduce((sum, node) => sum + node.loadPercent, 0);
  const averageLoad = nodeSnapshots.length > 0 ? Math.round(totalLoad / nodeSnapshots.length) : 0;
  const nextTargetUrl = getNodePool()[current % Math.max(getNodePool().length, 1)] || null;

  res.status(200).json({
    timestamp: new Date().toISOString(),
    topology: {
      orchestrator: {
        id: 'orchestrator',
        name: 'Orchestrator',
        status: 'online'
      },
      manager: {
        id: 'manager',
        name: 'Node Manager',
        status: 'online',
        strategy: 'round_robin',
        healthyNodeCount: healthyNodes.length,
        totalNodeCount: storageNodes.length,
        averageLoad,
        nextTarget: nextTargetUrl
          ? {
              name: inferNodeName(nextTargetUrl, storageNodes.indexOf(nextTargetUrl)),
              url: nextTargetUrl
            }
          : null
      },
      nodes: nodeSnapshots
    },
    events: eventLog.slice(-40).reverse()
  });
});

// 4. Legacy round-robin proxy route
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