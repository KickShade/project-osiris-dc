# 🧠 Osiris Smart Node Manager

The **Node Manager** is the brain of the storage layer. It acts as a Reverse Proxy and Load Balancer for the distributed storage nodes.

## 🛠 Features
- **Circuit Breaker:** Automatically detects if a storage node or its database is down and removes it from the rotation.
- **Round-Robin Load Balancing:** Distributes shards evenly across Node A, B, and C.
- **Transparency:** Passes the `x-managed-node` header back to the Orchestrator for metadata tracking.

## 📊 Status Endpoint
Check `GET /manager-status` to see the real-time health of the cluster.