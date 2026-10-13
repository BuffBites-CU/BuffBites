"""
Pydantic models for community combo creation and retrieval.

ComboCreate   — validates data sent when a user publishes a combo.
                Includes dishes with serving sizes, tags, optional images,
                and notes. Images are https URLs. Sizes are capped so one
                post can't bloat every feed response.

ComboUpdate   — the fields an author may edit, with the same limits.

ComboResponse — full combo data returned from the API including vote counts,
                author info, creation time, and expiry time.
                Published combos leave the feed after 24 hours (expires_at)
                and are deleted 7 days after publishing, which is how long
                they count toward weekly trends.

DishItem note:
    servings field accepts natural numbers only (1, 2, 3...)
    The frontend caps it at 5; the server allows up to 20.

Usage:
    from pydantic_models.community_models import ComboCreate, ComboResponse
"""

from pydantic import BaseModel, Field
from typing import Annotated, Optional
from datetime import datetime

Title = Annotated[str, Field(min_length=1, max_length=120)]
LongText = Annotated[str, Field(max_length=1000)]
Tag = Annotated[str, Field(max_length=30)]
ImageUrl = Annotated[str, Field(max_length=500, pattern=r"^https://\S+$")]

class DishItem(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    station: str = Field(max_length=120)
    servings: int = Field(1, ge=1, le=20)

class ComboCreate(BaseModel):
    title: Title
    dining_hall: str = Field(max_length=40)
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    dishes: list[DishItem] = Field(min_length=1, max_length=8)
    tags: list[Tag] = Field(default_factory=list, max_length=10)
    description: Optional[LongText] = None
    images: list[ImageUrl] = Field(default_factory=list, max_length=4)
    notes: Optional[LongText] = None

class ComboUpdate(BaseModel):
    title: Optional[Title] = None
    description: Optional[LongText] = None
    tags: Optional[list[Tag]] = Field(None, max_length=10)
    dishes: Optional[list[DishItem]] = Field(None, min_length=1, max_length=8)
    notes: Optional[LongText] = None

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