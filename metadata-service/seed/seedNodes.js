require("dotenv").config();
const mongoose = require("mongoose");
const Node = require("../src/models/Node");

mongoose.connect(process.env.MONGO_URI);

async function seed() {
    await Node.deleteMany();

    await Node.insertMany([
        {
            node_id: "node-a",
            url: "https://osiris-storage-node-a.onrender.com"
        },
        {
            node_id: "node-b",
            url: "https://osiris-storage-node-b.onrender.com"
        },
        {
            node_id: "node-c",
            url: "https://osiris-storage-node-c.onrender.com"
        }
    ]);

    console.log("Nodes seeded");
    process.exit();
}

seed();