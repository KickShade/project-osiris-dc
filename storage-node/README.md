# 📦 Osiris Storage Node (Worker)

This folder contains the core logic for the **Storage Node** (M2). Each instance of this service acts as a standalone "Worker" in the Project Osiris distributed cluster.

## 🚀 Role in Architecture

In our production environment, we run three identical instances of this service (**Node A, Node B, and Node C**). These nodes are "dumb" storage units — they do not know the file structure; they simply store and retrieve encrypted shards (fragments) as commanded by the **Smart Node Manager**.

### Key Features

- **Stateless CRUD:** Optimized for high-speed `POST` (Store) and `GET` (Retrieve) operations.
- **Mongoose Persistence:** Data is stored in a dedicated MongoDB Atlas collection.
- **Node Identification:** Every node identifies itself via a `NODE_ID` environment variable.
- **Health Reporting:** Provides real-time database connection status to the Load Balancer.

---

## 🛠 Tech Stack

| Layer       | Technology              |
|-------------|-------------------------|
| Runtime     | Node.js                 |
| Framework   | Express.js              |
| Database    | MongoDB Atlas (Mongoose ODM) |
| Deployment  | Docker                  |

---

## 🚦 Local Configuration

### 1. Environment Variables

Create a `.env` file inside this folder:

```env
PORT=3000
NODE_ID=node_a
MONGO_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/osiris_db
```

### 2. Installation & Run

```bash
npm install
node app.js
```

---

## 📡 API Endpoints (Internal)

| Endpoint      | Method | Description                              |
|---------------|--------|------------------------------------------|
| `/health`     | GET    | Returns connection status: `{"db": "connected"}` |
| `/shard`      | POST   | Saves a shard: `{ shard_id, file_id, data }` |
| `/shard/:id`  | GET    | Returns the raw shard data               |

---

## 🐳 Dockerization

This service is fully containerized. To build and run a local image:

```bash
docker build -t osiris-worker .
docker run -p 3000:3000 --env-file .env osiris-worker
```

---

## 🌐 Distributed Cluster

Each storage node is deployed as a separate Web Service on Render:

| Node       | URL                                          |
|------------|----------------------------------------------|
| Instance A | https://osiris-storage-node-a.onrender.com   |
| Instance B | https://osiris-storage-node-b.onrender.com   |
| Instance C | https://osiris-storage-node-c.onrender.com   |

> **Note:** All traffic to these nodes should ideally be routed through the Node Manager to ensure fault tolerance.