import os
import motor.motor_asyncio
from passlib.context import CryptContext
from fastapi import HTTPException, status
from pydantic import BaseModel

# 1. Database Instantiation
# Ingest the Atlas connection string via environment variables to preclude credential leakage.
MONGO_URI = os.getenv("MONGO_URI", "mongodb+srv://<username>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority")

# Instantiate the asynchronous Motor client
client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI)
db = client.identity_provider # Replace with your actual database moniker
users_collection = db.users

# 2. Cryptographic Context Setup
# Establish the hashing schema. Bcrypt automatically handles salt generation and key stretching.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class UserCredentials(BaseModel):  
    username: str
    password: str

def verify_password(plain_password: str, hashed_password: str) -> bool: 
    """Juxtaposes the plaintext string against the persisted hash."""
    return pwd_context.verify(plain_password, hashed_password)

# 3. The Asynchronous Authentication Logic
async def authenticate_user(credentials: UserCredentials) -> bool:
    """
    Queries MongoDB Atlas asynchronously to retrieve the user document,
    then cryptographically verifies the provided password.
    """
    # Yield control back to the event loop while the network request to Atlas transpires
    user_document = await users_collection.find_one({"username": credentials.username})
    
    # If the cursor returns None, the principal does not exist
    if not user_document:
        return False
        
    # Extract the pre-computed hash from the document (assume the field is named 'hashed_password')
    persisted_hash = user_document.get("hashed_password")
    
    # Verify the credentials, mitigating timing attacks via the underlying library
    return verify_password(credentials.password, persisted_hash)