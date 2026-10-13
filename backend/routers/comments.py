"""
Comments routes for community combos.

All routes are prefixed with /api/community/combos/{combo_id}/comments
plus a delete route at /api/community/comments/{comment_id}.

Comments expire with their combo (COMBO_RETENTION after it was published) and
are deleted when the author deletes the combo.

Endpoints:
    POST /api/community/combos/{combo_id}/comments   — add a comment (auth required, 404 if no such combo)
    GET  /api/community/combos/{combo_id}/comments   — get the newest 100 comments, oldest first (no auth)
    DELETE /api/community/comments/{comment_id}      — delete (owner only)
"""

from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from database import (
    COMBO_RETENTION,
    combos_collection,
    comments_collection,
    object_id_or_404,
    profile_username,
)
from pydantic_models.comment_models import CommentCreate, CommentResponse
from auth import get_current_user

router = APIRouter(tags=["comments"])


def _fmt(doc: dict) -> dict:
    return {"id": str(doc["_id"]), **{k: v for k, v in doc.items() if k != "_id"}}


@router.post("/api/community/combos/{combo_id}/comments", response_model=CommentResponse)
async def add_comment(combo_id: str, body: CommentCreate, current_user=Depends(get_current_user)):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Comment text cannot be empty")
    if len(body.text) > 500:
        raise HTTPException(status_code=400, detail="Comment must be ≤ 500 characters")

    oid = object_id_or_404(combo_id)
    combo = await combos_collection.find_one({"_id": oid}, {"created_at": 1})
    if not combo:
        raise HTTPException(status_code=404, detail="Combo not found")

    firebase_uid = current_user["uid"]
    username = await profile_username(firebase_uid) or "anonymous"

    doc = {
        "combo_id": str(oid),
        "text": body.text.strip(),
        "author_username": username,
        "author_firebase_uid": firebase_uid,
        "created_at": datetime.now(timezone.utc),
        # TTL: removed together with the combo, so no comment outlives it.
        "expires_at": combo["created_at"] + COMBO_RETENTION,
    }
    result = await comments_collection.insert_one(doc)
    return _fmt({**doc, "_id": result.inserted_id})


@router.get("/api/community/combos/{combo_id}/comments")
async def get_comments(combo_id: str):
    # Newest 100, so a flood of early comments can't hide later ones.
    docs = await comments_collection.find(
        {"combo_id": combo_id}
    ).sort("created_at", -1).to_list(100)
    return [_fmt(d) for d in reversed(docs)]


@router.delete("/api/community/comments/{comment_id}")
async def delete_comment(comment_id: str, current_user=Depends(get_current_user)):
    firebase_uid = current_user["uid"]
    oid = object_id_or_404(comment_id)
    doc = await comments_collection.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Comment not found")
    if doc["author_firebase_uid"] != firebase_uid:
        raise HTTPException(status_code=403, detail="Not authorized")
    await comments_collection.delete_one({"_id": oid})
    return {"message": "Comment deleted"}
