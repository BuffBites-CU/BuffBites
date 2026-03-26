"""
Community combo routes for BuffBites.

All routes are prefixed with /api/community.

Endpoints:
    POST /api/community/combos
        Publishes a new combo to the community feed.
        Automatically sets created_at and expires_at (24hrs from publish time).
        Requires firebase_uid and username as query params (from Firebase auth).

    GET /api/community/combos
        Returns all active (non-expired) combos sorted by upvotes.
        Optional ?dining_hall= filter to show combos for a specific hall.
        Used by the Community Page grid and search.

    GET /api/community/combos/{combo_id}
        Returns a single combo by ID.
        Used when a card is clicked to show full details + nutrition.

    POST /api/community/combos/{combo_id}/vote
        Records an upvote or downvote on a combo.
        vote_type must be "upvote" or "downvote".
        No duplicate vote prevention yet — to be added.

    GET /api/community/trends
        Returns top 20 combos by upvotes for the current day.
        Optional ?dining_hall= filter supports multi-select on Trends page.
        Resets daily as combos expire after 24 hours.

Usage:
    from routers.community import router
    app.include_router(router)
"""

from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta
from bson import ObjectId
from database import combos_collection
from pydantic_models.community_models import ComboCreate, ComboResponse

router = APIRouter(prefix="/api/community", tags=["community"])

@router.post("/combos", response_model=ComboResponse)
async def publish_combo(combo: ComboCreate, firebase_uid: str, username: str):
    combo_doc = {
        **combo.model_dump(),
        "upvotes": 0,
        "downvotes": 0,
        "author_username": username,
        "author_firebase_uid": firebase_uid,
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(hours=24)
    }
    result = await combos_collection.insert_one(combo_doc)
    return {**combo_doc, "id": str(result.inserted_id)}

@router.get("/combos")
async def get_community_combos(dining_hall: str | None = None):
    query = {"expires_at": {"$gt": datetime.utcnow()}}
    if dining_hall:
        query["dining_hall"] = dining_hall

    combos = await combos_collection.find(query).sort("upvotes", -1).to_list(100)
    return [
        {**c, "id": str(c["_id"])}
        for c in combos
    ]

@router.post("/combos/{combo_id}/vote")
async def vote_combo(combo_id: str, vote_type: str, firebase_uid: str):
    if vote_type not in ("upvote", "downvote"):
        raise HTTPException(status_code=400, detail="vote_type must be upvote or downvote")

    field = "upvotes" if vote_type == "upvote" else "downvotes"
    result = await combos_collection.update_one(
        {"_id": ObjectId(combo_id)},
        {"$inc": {field: 1}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Combo not found")
    return {"message": f"{vote_type} recorded"}

@router.get("/combos/{combo_id}")
async def get_combo(combo_id: str):
    combo = await combos_collection.find_one({"_id": ObjectId(combo_id)})
    if not combo:
        raise HTTPException(status_code=404, detail="Combo not found")
    return {**combo, "id": str(combo["_id"])}

@router.get("/trends")
async def get_trends(dining_hall: str | None = None):
    query = {"expires_at": {"$gt": datetime.utcnow()}}
    if dining_hall:
        query["dining_hall"] = dining_hall

    combos = await combos_collection.find(query).sort("upvotes", -1).to_list(20)
    return [
        {**c, "id": str(c["_id"])}
        for c in combos
    ]