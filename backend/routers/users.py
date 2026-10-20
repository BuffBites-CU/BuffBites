"""
User profile routes for BuffBites.

All routes are prefixed with /api/users. Every route except check-username
needs a Firebase ID token, and a {firebase_uid} in the path must be the
caller's own uid (403 otherwise): a profile holds the student's email and meal
history, so nobody else may read or change it.

Endpoints:
    GET /api/users/check-username/{username}
        Public; onboarding uses it to show whether a username is free.

    POST /api/users/
        Creates a new user profile after Firebase Google sign-in.
        Called once during onboarding (username + dietary preferences setup).
        firebase_uid and email come from the ID token, not the body.
        Returns 400 if the profile or username already exists.

    GET /api/users/{firebase_uid}
        Fetches the caller's own profile.
        Used to load the User Profile page and check if onboarding is complete.

    PUT /api/users/{firebase_uid}
        Updates profile fields (username, preferences, avatar, etc).
        Only UserUpdate's fields are accepted; only provided fields are updated.

    DELETE /api/users/{firebase_uid}
        Deletes the account and everything tied to it: profile, meal log,
        favorites, body stats, community posts and comments, chat messages,
        tables, blocks, the Strava link (revoked at Strava) and cached plans,
        then the Firebase sign-in record.

    POST/DELETE /api/users/{firebase_uid}/meal-log
    POST/DELETE /api/users/{firebase_uid}/favorites
        Add or remove one entry. Both lists keep only their newest entries.

Usage:
    from routers.users import router
    app.include_router(router)
"""


import asyncio
import re

import structlog
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timedelta, timezone
from pymongo.errors import DuplicateKeyError
import strava_client
from auth import delete_firebase_user, get_current_user
from database import (
    chat_blocks_collection, chat_messages_collection, combos_collection, comments_collection,
    tables_collection, users_collection,
)
from pydantic_models.user_models import UserCreate, UserUpdate, UserResponse, MealLogEntry, FavoriteCombo

router = APIRouter(prefix="/api/users", tags=["users"])
logger = structlog.get_logger()

# Newest entries kept by $push/$slice, so a user document can't grow forever.
MEAL_LOG_CAP = 1000
FAVORITES_CAP = 200

USERNAME_TAKEN = "Username already taken"


async def _username_owner(username: str) -> dict | None:
    """The profile using this username in any letter case, so "Ralphie" can't
    be registered next to "ralphie" and pass as them in the community feed."""
    pattern = f"^{re.escape(username)}$"
    return await users_collection.find_one(
        {"username": {"$regex": pattern, "$options": "i"}}, {"firebase_uid": 1}
    )


async def own_uid(firebase_uid: str, current_user: dict = Depends(get_current_user)) -> str:
    """The path's firebase_uid, once it is checked against the caller's token."""
    if firebase_uid != current_user["uid"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    return firebase_uid


@router.get("/check-username/{username}")
async def check_username(username: str):
    return {"available": await _username_owner(username) is None}

@router.post("/", response_model=UserResponse)
async def create_user(user: UserCreate, current_user: dict = Depends(get_current_user)):
    firebase_uid = current_user["uid"]
    # Check if user already exists
    existing = await users_collection.find_one({"firebase_uid": firebase_uid})
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")

    # Check if username is taken
    if await _username_owner(user.username):
        raise HTTPException(status_code=400, detail=USERNAME_TAKEN)

    user_doc = {
        **user.model_dump(),
        "firebase_uid": firebase_uid,
        "email": current_user.get("email") or "",
        "karma": 0,
        "created_at": datetime.now(timezone.utc)
    }
    try:
        await users_collection.insert_one(user_doc)
    except DuplicateKeyError as e:
        # Lost a race with a concurrent request; the unique indexes decide.
        if "firebase_uid" in ((e.details or {}).get("keyPattern") or {}):
            raise HTTPException(status_code=400, detail="User already exists")
        raise HTTPException(status_code=400, detail=USERNAME_TAKEN)
    return {**user_doc, "id": str(user_doc["_id"])}

@router.get("/{firebase_uid}", response_model=UserResponse)
async def get_user(firebase_uid: str = Depends(own_uid)):
    user = await users_collection.find_one({"firebase_uid": firebase_uid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {**user, "id": str(user["_id"])}

@router.put("/{firebase_uid}")
async def update_user(updates: UserUpdate, firebase_uid: str = Depends(own_uid)):
    changes = updates.model_dump(exclude_unset=True)
    if not changes:
        if not await users_collection.find_one({"firebase_uid": firebase_uid}, {"_id": 1}):
            raise HTTPException(status_code=404, detail="User not found")
        return {"message": "User updated successfully"}

    if "username" in changes:
        taken = await _username_owner(changes["username"])
        if taken and taken["firebase_uid"] != firebase_uid:
            raise HTTPException(status_code=400, detail=USERNAME_TAKEN)
    try:
        result = await users_collection.update_one(
            {"firebase_uid": firebase_uid},
            {"$set": changes}
        )
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail=USERNAME_TAKEN)
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User updated successfully"}

@router.delete("/{firebase_uid}")
async def delete_account(firebase_uid: str = Depends(own_uid)):
    uid = firebase_uid
    await strava_client.disconnect(uid)

    # Community posts, with every comment on them, and the user's other comments.
    own_combos = await combos_collection.find({"author_firebase_uid": uid}, {"_id": 1}).to_list(None)
    for combo in own_combos:
        await comments_collection.delete_many({"combo_id": str(combo["_id"])})
    await combos_collection.delete_many({"author_firebase_uid": uid})
    await comments_collection.delete_many({"author_firebase_uid": uid})
    await combos_collection.update_many({"voters": uid}, {"$pull": {"voters": uid}})

    # Tables they host close with their chat; at others they just leave their seat.
    for table in await tables_collection.find({"uids": uid}).to_list(None):
        if table["host_uid"] == uid:
            await tables_collection.delete_one({"_id": table["_id"]})
            await chat_messages_collection.delete_many({"room": f"table:{table['_id']}"})
        else:
            keep = [(u, n) for u, n in zip(table["uids"], table["names"]) if u != uid]
            await tables_collection.update_one(
                {"_id": table["_id"]},
                {"$set": {"uids": [u for u, _ in keep], "names": [n for _, n in keep]}},
            )
    await chat_messages_collection.delete_many({"author_uid": uid})
    await chat_messages_collection.update_many({"reports": uid}, {"$pull": {"reports": uid}})
    await chat_blocks_collection.delete_many({"$or": [{"uid": uid}, {"blocked_uid": uid}]})

    await users_collection.delete_one({"firebase_uid": uid})
    try:
        await asyncio.to_thread(delete_firebase_user, uid)
    except Exception as e:  # the data is gone; a stale sign-in record only lets them start fresh
        logger.warning("firebase_delete_failed", error=str(e))
    return {"deleted": True}

@router.post("/{firebase_uid}/meal-log")
async def log_meal(entry: MealLogEntry, firebase_uid: str = Depends(own_uid)):
    result = await users_collection.update_one(
        {"firebase_uid": firebase_uid},
        {"$push": {"meal_log": {"$each": [entry.model_dump()], "$slice": -MEAL_LOG_CAP}}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Meal logged"}

@router.delete("/{firebase_uid}/meal-log")
async def delete_meal(logged_at: str, firebase_uid: str = Depends(own_uid)):
    try:
        # logged_at is stored as BSON Date — parse ISO string back to datetime for matching
        ts = logged_at.replace("Z", "+00:00")
        logged_at_dt = datetime.fromisoformat(ts)
        if logged_at_dt.tzinfo is None:
            logged_at_dt = logged_at_dt.replace(tzinfo=timezone.utc)
    except (ValueError, OverflowError):
        raise HTTPException(status_code=400, detail="Invalid logged_at format")

    # Use a 1-second window to tolerate any microsecond precision differences
    start = logged_at_dt.replace(microsecond=0)
    end   = start + timedelta(seconds=1)

    result = await users_collection.update_one(
        {"firebase_uid": firebase_uid},
        {"$pull": {"meal_log": {"logged_at": {"$gte": start, "$lt": end}}}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Meal removed"}

@router.post("/{firebase_uid}/favorites")
async def add_favorite(combo: FavoriteCombo, firebase_uid: str = Depends(own_uid)):
    result = await users_collection.update_one(
        {"firebase_uid": firebase_uid},
        {"$push": {"favorites": {"$each": [combo.model_dump()], "$slice": -FAVORITES_CAP}}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Favorite saved"}

@router.delete("/{firebase_uid}/favorites")
async def remove_favorite(title: str, dining_hall: str, date: str, firebase_uid: str = Depends(own_uid)):
    result = await users_collection.update_one(
        {"firebase_uid": firebase_uid},
        {"$pull": {"favorites": {"title": title, "dining_hall": dining_hall, "date": date}}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Favorite removed"}
