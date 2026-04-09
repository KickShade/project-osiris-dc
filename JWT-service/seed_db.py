#this is gonna help us add data to the database

import asyncio
import os
from passlib.context import CryptContext
import motor.motor_asyncio

# Initialize the cryptographic context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def provision_test_subjects():
    """
    Connects to the MongoDB container via internal DNS and seeds 
    the database with cryptographically secured test credentials.
    """
    print("Initiating database seeding protocol...")
    
    # Target the internal Docker DNS name
    MONGO_URI = os.getenv(
        "MONGO_URI", 
        "mongodb://admin:pizza@mongodb_service:27017/"
    )
    
    client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI)
    collection = client.auth_db.users

    # Define your test subjects (Plaintext here, but never in the DB)
    test_users = [
        {"username": "Urdhva_Admin", "raw_password": "coffee"},
        {"username": "test_client", "raw_password": "shirts"}
    ]

    for user in test_users:
        # Check if the user already exists 
        existing_user = await collection.find_one({"username": user["username"]})
        if existing_user:
            print(f"Subject '{user['username']}' already extant. Bypassing.")
            continue

        # Generate the bcrypt hash
        hashed_cipher = pwd_context.hash(user["raw_password"])
        
        # Persist the document containing ONLY the hash, never the raw password
        await collection.insert_one({
            "username": user["username"],
            "password_hash": hashed_cipher
        })
        print(f"Successfully provisioned subject: '{user['username']}'")

if __name__ == "__main__":
    # Execute the asynchronous coroutine
    asyncio.run(provision_test_subjects())