import os
from datetime import datetime, timedelta, timezone
from fastapi.middleware.cors import CORSMiddleware 
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
import jwt
import motor.motor_asyncio
from passlib.context import CryptContext

# 1. Application & Cryptographic Instantiation
app = FastAPI()

permitted_origins = [
    "http://192.168.1.100",        #THIS IS EXAMPLE IP OF FRONTEND
    "http://192.168.1.100:3000",   #PORT OF FRONTEND
    # "http://localhost",          #only if you gonna deploy frontend locally
]


#N-Line 62
app.add_middleware(
    CORSMiddleware,
    allow_origins=permitted_origins, 
    allow_credentials=True, #Essential if you eventually use HttpOnly cookies to store the JWT
    allow_methods=["*"],    #Permits all HTTP verbs (GET, POST, OPTIONS, etc.)
    allow_headers=["*"],    #Permits all incoming headers (like Authorization)
)

# In a ubiquitous production environment, these must be injected via environment variables
SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Establish the hashing schema (Bcrypt inherently manages salt entropy)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Database Topological Configuration
# Leveraging Docker's internal DNS: connecting to 'mongodb_service' on port 27017
# using the root credentials defined in your docker-compose.yml.
# (Note: In strict production, swap these for scoped application credentials).
MONGO_URI = os.getenv(
    "MONGO_URI", 
    "mongodb://admin:secure_password_here@mongodb_service:27017/"
)

# Instantiate the asynchronous Motor client and bind to the specific database
db_client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI)
database = db_client.auth_db
users_collection = database.users

# Pydantic Models
class UserCredentials(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

# Cryptographic Utility Functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Juxtaposes the plaintext string against the persisted cryptographic hash."""
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: timedelta) -> str:
    """Mints the JWT with specified claims and a Time-To-Live (TTL)."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Asynchronous Authentication & Egress
async def authenticate_user(credentials: UserCredentials) -> bool:
    """
    Queries the local MongoDB container asynchronously to retrieve the user document,
    mitigating I/O bottlenecks during network transit.
    """
    # Yield control to the event loop while awaiting the database cursor
    user_document = await users_collection.find_one({"username": credentials.username})
    
    if not user_document:
        return False
        
    persisted_hash = user_document.get("password_hash")
    
    # Ensure the hash exists and verify the provided plaintext credential
    if persisted_hash and verify_password(credentials.password, persisted_hash):
        return True
        
    return False

@app.post("/token", response_model=Token)
async def login_for_access_token(credentials: UserCredentials):
    """The primary ingress endpoint for credential verification and token minting."""
    
    # Crucially, we must 'await' the coroutine
    is_authenticated = await authenticate_user(credentials)
    
    if not is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    access_token = create_access_token(
        data={"sub": credentials.username}, 
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}