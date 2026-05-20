"""
Pydantic models for community combo creation and retrieval.

ComboCreate   — validates data sent when a user publishes or saves a combo.
                Includes dishes with serving sizes, tags, optional images,
                and notes. Images are stored as URLs (from camera roll or
                camera, max limit enforced on frontend).

ComboResponse — full combo data returned from the API including vote counts,
                author info, creation time, and expiry time.
                All published combos expire after 24 hours and are then
                archived under the author's profile (cannot be republished).

DishItem note:
    servings field accepts natural numbers only (1, 2, 3...)
    enforced on the frontend during combo creation.

Usage:
    from pydantic_models.community_models import ComboCreate, ComboResponse
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class DishItem(BaseModel):
    name: str
    station: str
    servings: int = 1

class ComboCreate(BaseModel):
    title: str
    dining_hall: str
    date: str
    dishes: list[DishItem]
    tags: list[str] = []
    description: Optional[str] = None
    images: list[str] = []
    notes: Optional[str] = None

class ComboUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    dishes: Optional[list[DishItem]] = None
    notes: Optional[str] = None

class ComboResponse(BaseModel):
    id: str
    title: str
    dining_hall: str
    date: str
    dishes: list[DishItem]
    tags: list[str]
    description: Optional[str]
    images: list[str]
    notes: Optional[str]
    upvotes: int = 0
    downvotes: int = 0
    author_username: str
    author_firebase_uid: str
    created_at: datetime
    expires_at: datetime