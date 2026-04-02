from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
import jwt

# Instantiate the FastAPI application
app = FastAPI()

# Cryptographic prerequisites 
#In production, to be injected via environment variables
SECRET_KEY = "your-highly-entropic-super-secret-key"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

class UserCredentials(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

def authenticate_user(credentials: UserCredentials) -> bool:
    """
    Mock database query. 
    In a ubiquitous environment, this would query a secure relational or NoSQL database 
    and verify hashed passwords (e.g., using bcrypt or Argon2).
    """
    if credentials.username == "admin" and credentials.password == "hunter2":
        return True
    return False

def create_access_token(data: dict, expires_delta: timedelta) -> str:
    """Mints the JWT with specified claims and a TTL."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    
    # Update the payload with the expiration claim ('exp')
    to_encode.update({"exp": expire})
    
    # Cryptographically sign the payload
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

@app.post("/token", response_model=Token)
async def login_for_access_token(credentials: UserCredentials):
    """The primary ingress point for authentication."""
    if not authenticate_user(credentials):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # Mint the token with the subject ('sub') claim
    access_token = create_access_token(
        data={"sub": credentials.username}, 
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}