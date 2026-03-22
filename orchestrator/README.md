# Orchestrator Service Documentation

The Orchestrator acts as the central gateway and data manager for the Distributed File Storage System. It is responsible for client authentication, file transformation (sharding and reassembly), and coordinating communication between the Metadata Service and the Storage Manager Node.

---

## Core Responsibilities

1. **Traffic Control**: Routing user requests and ensuring only authenticated users can upload or download files via middleware.
2. **Data Partitioning**: Deconstructing binary file data into smaller, manageable shards for distributed storage.
3. **Metadata Coordination**: Recording the "recipe" or mapping that identifies which shards belong to which file and their respective sequence.
4. **Health Monitoring**: Periodically verifying the availability of the Metadata Service and the Storage Manager Node.

---

## Folder Structure and Component Logic

### app.js (Entry Point)
The primary Express application file and central entry point. It applies global middleware (CORS, JSON parsing), mounts all feature-specific routes, handles global asynchronous errors, and connects the primary routing modules for upload, download, and file management.

### routes/ (API Interface)
* **upload.js**: 
    1. Receives the raw file via multer (memory storage).
    2. Calls the sharding logic to split the buffer.
    3. Interfaces with the `nodeClient` to push all shards to the **Storage Manager Node**.
    4. Interfaces with the `metadataClient` to save the file "recipe."
* **download.js**: 
    1. Receives a `fileId`.
    2. Retrieves the shard mapping from the Metadata Service.
    3. Requests the binary shards from the **Storage Manager Node**.
    4. Calls the reassembly logic to reconstruct the original file and streams it to the user.
* **files.js**: A management route to query the Metadata Service for a list of all available files or specific file details.

### lib/ (Core Logic)
* **sharding.js**: Contains the mathematical and buffer-handling logic for data transformation.
    * `splitFile(buffer)`: Logic to divide a file into $N$ smaller Buffer objects.
    * `reconstruct(shards)`: Logic to concatenate an array of Buffer objects back into one identical file.
* **nodeClient.js**: The abstraction layer for HTTP communication with the **Storage Manager Node**. It handles multipart/form-data transmission for uploads and binary array buffers for downloads.
* **metadataClient.js**: The abstraction layer for the Metadata Service. It handles CRUD operations for file "recipes" (mapping file IDs to shard IDs and sequences).
* **healthCheck.js**: A background utility that periodically verifies if the Storage Manager and Metadata Service are online.

---

## Data Flow Specifications

### 1. Uploading (The Split)
During a file upload, the orchestrator performs a Scatter operation:
1. The file buffer is read into memory.
2. The shard size is calculated based on the configured shard count: $Size_{shard} = \lceil \frac{TotalSize}{NumShards} \rceil$.
3. The buffer is sliced into $N$ distinct pieces.
4. Shards are bundled and dispatched to the **Storage Manager Node**.
5. The Metadata Service is updated with the returned shard locations.

### 2. Downloading (The Merge)
To retrieve a file, the orchestrator performs a Gather operation:
1. The Metadata Service is queried for the Shard IDs.
2. The orchestrator requests these shards from the **Storage Manager Node**.
3. The system validates that all shards have been successfully received.
4. Buffers are concatenated in the exact sequence defined by the metadata.
5. The complete file is streamed back to the client.

---

## Environment Configuration (.env)
The orchestrator requires the following configurations:
* **STORAGE_MANAGER_URL**: Endpoint for the Storage Manager Node.
* **METADATA_SERVICE_URL**: Endpoint for the Metadata Service.
* **JWT_SECRET**: Key used for verifying user authentication tokens.
* **DEFAULT_SHARD_COUNT**: The number of pieces a file should be split into.

---

## System Architecture and Workflow

### The Upload Flow:
When a user sends a file via `POST /upload`:
1. **Entry** (`routes/upload.js`): Receives the file buffer.
2. **Sharding Logic** (`sharding.js`): Splits the buffer into the defined number of shards.
3. **Distribution** (`nodeClient.js`): Sends the batch of shards to the **Storage Manager Node**.
4. **Metadata** (`metadataClient.js`): Saves a map identifying which file ID corresponds to which shard IDs and their storage sequence.