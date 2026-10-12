"""
Pydantic models for user creation and retrieval.

UserCreate  — validates incoming data when a new user completes profile setup
              after Firebase Google sign-in. Stores firebase_uid as the
              primary identifier instead of a custom password system.

UserResponse — shape of user data returned from GET /api/users/{firebase_uid}.
               Never returns sensitive fields.

Avatar note:
    avatar field stores the ID of the selected preset avatar image
    e.g. "avatar_1", "avatar_2" ... "avatar_10"
    The frontend maps these IDs to actual images.

Usage:
    from pydantic_models.user_models import UserCreate, UserResponse
"""

from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import datetime, timezone

class NutritionGoals(BaseModel):
    protein_g_per_meal: Optional[int] = None        # target grams of protein per meal
    dietary_focus: Optional[str] = None             # "balanced"|"high-protein"|"low-carb"|"weight-loss"|"muscle-gain"|"endurance"
    priority_nutrients: list[str] = []              # e.g. ["iron","calcium","vitamin-d","fiber","omega-3","b12"]

class BodyStats(BaseModel):
    """Optional stats for the fuel coach's calorie estimate. Never returned by
    the public profile endpoint; read and written only via /api/coach/body."""
    weight_kg: Optional[float] = Field(None, ge=30, le=250)
    height_cm: Optional[float] = Field(None, ge=120, le=230)
    age: Optional[int] = Field(None, ge=16, le=90)
    sex: Optional[Literal["male", "female", "unspecified"]] = None

class MealLogEntry(BaseModel):
    title: str
    calories: int
    protein_g: Optional[int] = None
    fat_g: Optional[int] = None
    carbs_g: Optional[int] = None
    date: str          # YYYY-MM-DD
    dining_hall: str
    meal_period: str
    logged_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FavoriteCombo(BaseModel):
    title: str
    dining_hall: str
    date: str
    description: Optional[str] = None
    approximate_calories: Optional[int] = None
    tags: list[str] = []
    dishes: list[dict] = []
    saved_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    firebase_uid: str
    email: str
    username: str
    dietary_preferences: list[str] = []
    restrictions: list[str] = []
    avatar: Optional[str] = None
    preferred_calories_per_meal: Optional[int] = None
    default_dining_hall: Optional[str] = None
    nutrition_goals: Optional[NutritionGoals] = None

class UserResponse(BaseModel):
    firebase_uid: str
    email: str
    username: str
    dietary_preferences: list[str]
    restrictions: list[str]
    avatar: Optional[str]
    karma: int = 0
    created_at: datetime
    preferred_calories_per_meal: Optional[int] = None
    default_dining_hall: Optional[str] = None
    nutrition_goals: Optional[NutritionGoals] = None
    meal_log: list[MealLogEntry] = []
    favorites: list[FavoriteCombo] = []