"""
Comments routes for community combos.

All routes are prefixed with /api/community/combos/{combo_id}/comments
plus a delete route at /api/community/comments/{comment_id}.

Endpoints:
    POST /api/community/combos/{combo_id}/comments   — add a comment (auth required)
    GET  /api/community/combos/{combo_id}/comments   — get all comments (no auth)
    DELETE /api/community/comments/{comment_id}      — delete (owner only)
"""

from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from bson import ObjectId
from database import db
from pydantic_models.comment_models import CommentCreate, CommentResponse
from auth import get_current_user

comments_collection = db["comments"]

router = APIRouter(tags=["comments"])


def _fmt(doc: dict) -> dict:
    return {"id": str(doc["_id"]), **{k: v for k, v in doc.items() if k != "_id"}}


@router.post("/api/community/combos/{combo_id}/comments", response_model=CommentResponse)
async def add_comment(combo_id: str, body: CommentCreate, current_user=Depends(get_current_user)):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Comment text cannot be empty")
    if len(body.text) > 500:
        raise HTTPException(status_code=400, detail="Comment must be ≤ 500 characters")

    firebase_uid = current_user["uid"]
    username = current_user.get("name", "anonymous")

    # Look up username from users collection for accuracy
    from database import users_collection
    user_doc = await users_collection.find_one({"firebase_uid": firebase_uid})
    if user_doc:
        username = user_doc.get("username", username)

    doc = {
        "combo_id": combo_id,
        "text": body.text.strip(),
        "author_username": username,
        "author_firebase_uid": firebase_uid,
        "created_at": datetime.now(timezone.utc),
    }
    result = await comments_collection.insert_one(doc)
    return _fmt({**doc, "_id": result.inserted_id})


@router.get("/api/community/combos/{combo_id}/comments")
async def get_comments(combo_id: str):
    docs = await comments_collection.find(
        {"combo_id": combo_id}
    ).sort("created_at", 1).to_list(100)
    return [_fmt(d) for d in docs]


@router.delete("/api/community/comments/{comment_id}")
async def delete_comment(comment_id: str, current_user=Depends(get_current_user)):
    firebase_uid = current_user["uid"]
    doc = await comments_collection.find_one({"_id": ObjectId(comment_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Comment not found")
    if doc["author_firebase_uid"] != firebase_uid:
        raise HTTPException(status_code=403, detail="Not authorized")
    await comments_collection.delete_one({"_id": ObjectId(comment_id)})
    return {"message": "Comment deleted"}
