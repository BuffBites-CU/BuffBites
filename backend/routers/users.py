"""
User profile routes for BuffBites.

All routes are prefixed with /api/users.

Endpoints:
    POST /api/users/
        Creates a new user profile after Firebase Google sign-in.
        Called once during onboarding (username + dietary preferences setup).
        Returns 400 if firebase_uid or username already exists.

    GET /api/users/{firebase_uid}
        Fetches a user's profile by their Firebase UID.
        Used to load the User Profile page and check if onboarding is complete.

    PUT /api/users/{firebase_uid}
        Updates user profile fields (username, preferences, avatar, etc).
        Accepts a partial dict — only provided fields are updated.

Usage:
    from routers.users import router
    app.include_router(router)
"""


from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta, timezone
from database import users_collection
from pydantic_models.user_models import UserCreate, UserResponse, MealLogEntry

router = APIRouter(prefix="/api/users", tags=["users"])

@router.get("/check-username/{username}")
async def check_username(username: str):
    taken = await users_collection.find_one({"username": username})
    return {"available": taken is None}

@router.post("/", response_model=UserResponse)
async def create_user(user: UserCreate):
    # Check if user already exists
    existing = await users_collection.find_one({"firebase_uid": user.firebase_uid})
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")

    # Check if username is taken
    username_taken = await users_collection.find_one({"username": user.username})
    if username_taken:
        raise HTTPException(status_code=400, detail="Username already taken")

    user_doc = {
        **user.model_dump(),
        "karma": 0,
        "created_at": datetime.now(timezone.utc)
    }
    await users_collection.insert_one(user_doc)
    return {**user_doc, "id": str(user_doc["_id"])}

@router.get("/{firebase_uid}", response_model=UserResponse)
async def get_user(firebase_uid: str):
    user = await users_collection.find_one({"firebase_uid": firebase_uid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {**user, "id": str(user["_id"])}

@router.put("/{firebase_uid}")
async def update_user(firebase_uid: str, updates: dict):
    result = await users_collection.update_one(
        {"firebase_uid": firebase_uid},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User updated successfully"}

@router.post("/{firebase_uid}/meal-log")
async def log_meal(firebase_uid: str, entry: MealLogEntry):
    result = await users_collection.update_one(
        {"firebase_uid": firebase_uid},
        {"$push": {"meal_log": entry.model_dump()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Meal logged"}