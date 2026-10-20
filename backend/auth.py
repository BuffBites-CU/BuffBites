"""
Firebase Authentication middleware for BuffBites.

Provides a FastAPI dependency that verifies Firebase ID tokens sent by the frontend.

The frontend sends the token in the Authorization header:
    Authorization: Bearer <firebase_id_token>

verify_token(token)
    Decodes and verifies the token using Firebase Admin SDK.
    Returns the decoded token dict containing uid, email, etc.
    Raises HTTP 401 if token is missing or invalid.

get_current_user(token)
    FastAPI dependency — use this in any route that requires authentication.
    Returns the decoded Firebase token.

get_optional_user(token)
    FastAPI dependency for public routes that personalise their response for a
    signed-in caller. Returns None when no token is sent; an invalid token is
    still a 401.

Usage:
    from auth import get_current_user

    @router.get("/protected")
    async def protected_route(user=Depends(get_current_user)):
        return {"uid": user["uid"]}
"""

import json
import os
import firebase_admin
from firebase_admin import auth, credentials
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pathlib import Path

# Initialize Firebase Admin SDK once.
# In production, set FIREBASE_SERVICE_ACCOUNT_JSON to the full JSON string.
# Locally, place serviceAccountKey.json next to this file.
_sa_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
if _sa_json:
    cred = credentials.Certificate(json.loads(_sa_json))
else:
    cred_path = Path(__file__).parent / "serviceAccountKey.json"
    if not cred_path.exists():
        raise RuntimeError(
            "Firebase credentials not found. Set FIREBASE_SERVICE_ACCOUNT_JSON env var "
            "or place serviceAccountKey.json in the backend directory."
        )
    cred = credentials.Certificate(str(cred_path))

firebase_admin.initialize_app(cred)

security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)

def verify_token(token: str) -> dict:
    try:
        decoded = auth.verify_id_token(token)
        return decoded
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

def delete_firebase_user(uid: str) -> None:
    """Remove the Firebase sign-in record. Already gone counts as done."""
    try:
        auth.delete_user(uid)
    except auth.UserNotFoundError:
        pass

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> dict:
    return verify_token(credentials.credentials)

def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Security(optional_security)
) -> dict | None:
    if credentials is None:
        return None
    # The token only personalises a public read (has_voted, quotas). An expired
    # or unverifiable one makes the caller a guest instead of failing the read.
    try:
        return verify_token(credentials.credentials)
    except HTTPException:
        return None
