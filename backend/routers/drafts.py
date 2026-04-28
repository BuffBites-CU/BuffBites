"""
Drafts routes for BuffBites.

All routes are prefixed with /api/drafts.

Drafts are combos saved by the user before publishing.
They never expire and live under the user's profile.
A draft can be published once — after publishing it becomes
a community combo and the draft is deleted.

Endpoints:
    POST /api/drafts/
        Save a new draft. Requires Firebase auth.

    GET /api/drafts/{firebase_uid}
        Get all drafts for a user. Requires Firebase auth.
        Only the owner can view their own drafts.

    PUT /api/drafts/{draft_id}
        Update an existing draft. Requires Firebase auth.

    DELETE /api/drafts/{draft_id}
        Delete a draft. Requires Firebase auth.

    POST /api/drafts/{draft_id}/publish
        Publish a draft to the community feed.
        Creates a community combo and deletes the draft.
        Requires Firebase auth.

Usage:
    from routers.drafts import router
    app.include_router(router)
"""

from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timedelta
from bson import ObjectId
from database import drafts_collection, combos_collection
from pydantic_models.community_models import ComboCreate, ComboResponse
from auth import get_current_user

router = APIRouter(prefix="/api/drafts", tags=["drafts"])


@router.post("/")
async def save_draft(combo: ComboCreate, current_user=Depends(get_current_user)):
    draft_doc = {
        **combo.model_dump(),
        "author_firebase_uid": current_user["uid"],
        "author_username": current_user.get("name", ""),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await drafts_collection.insert_one(draft_doc)
    return {**draft_doc, "id": str(result.inserted_id)}


@router.get("/{firebase_uid}")
async def get_drafts(firebase_uid: str, current_user=Depends(get_current_user)):
    if current_user["uid"] != firebase_uid:
        raise HTTPException(status_code=403, detail="Not authorized to view these drafts")

    drafts = await drafts_collection.find(
        {"author_firebase_uid": firebase_uid}
    ).sort("updated_at", -1).to_list(100)

    return [{**d, "id": str(d["_id"])} for d in drafts]


@router.put("/{draft_id}")
async def update_draft(draft_id: str, updates: dict, current_user=Depends(get_current_user)):
    draft = await drafts_collection.find_one({"_id": ObjectId(draft_id)})
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft["author_firebase_uid"] != current_user["uid"]:
        raise HTTPException(status_code=403, detail="Not authorized to update this draft")

    updates["updated_at"] = datetime.utcnow()
    await drafts_collection.update_one(
        {"_id": ObjectId(draft_id)},
        {"$set": updates}
    )
    return {"message": "Draft updated successfully"}


@router.delete("/{draft_id}")
async def delete_draft(draft_id: str, current_user=Depends(get_current_user)):
    draft = await drafts_collection.find_one({"_id": ObjectId(draft_id)})
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft["author_firebase_uid"] != current_user["uid"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete this draft")

    await drafts_collection.delete_one({"_id": ObjectId(draft_id)})
    return {"message": "Draft deleted successfully"}


@router.post("/{draft_id}/publish")
async def publish_draft(draft_id: str, current_user=Depends(get_current_user)):
    draft = await drafts_collection.find_one({"_id": ObjectId(draft_id)})
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft["author_firebase_uid"] != current_user["uid"]:
        raise HTTPException(status_code=403, detail="Not authorized to publish this draft")

    # Create community combo from draft
    combo_doc = {
        "title":              draft["title"],
        "dining_hall":        draft["dining_hall"],
        "date":               draft["date"],
        "dishes":             draft["dishes"],
        "tags":               draft["tags"],
        "description":        draft.get("description", ""),
        "images":             draft.get("images", []),
        "notes":              draft.get("notes", ""),
        "upvotes":            0,
        "downvotes":          0,
        "author_username":    draft["author_username"],
        "author_firebase_uid": current_user["uid"],
        "created_at":         datetime.utcnow(),
        "expires_at":         datetime.utcnow() + timedelta(hours=24),
    }
    result = await combos_collection.insert_one(combo_doc)

    # Delete the draft after publishing
    await drafts_collection.delete_one({"_id": ObjectId(draft_id)})

    return {**combo_doc, "id": str(result.inserted_id)}