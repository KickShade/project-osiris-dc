const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 4000;

// The list of your live Render URLs
const storageNodes = [
  'https://osiris-storage-node-a.onrender.com',
  'https://osiris-storage-node-b.onrender.com',
  'https://osiris-storage-node-c.onrender.com'
];

let healthyNodes = [...storageNodes];

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

// 2. Round-Robin Proxy Logic
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

// 3. Manager's own health check
app.get('/manager-status', (req, res) => {
  res.json({ status: "online", healthy_count: healthyNodes.length, nodes: healthyNodes });
});

app.listen(PORT, () => console.log(`Node Manager active on port ${PORT}`));