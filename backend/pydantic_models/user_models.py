"""
Pydantic models for user creation and retrieval.

UserCreate  — validates incoming data when a new user completes profile setup
              after Firebase Google sign-in. firebase_uid and email come from
              the caller's verified ID token, never from the body.

UserUpdate  — the only fields PUT /api/users/{firebase_uid} may change. Unknown
              fields (karma, firebase_uid, email, body, meal_log, ...) are a 422.

UserResponse — shape of user data returned from GET /api/users/{firebase_uid}.
               Only ever returned to the profile's owner.

Avatar note:
    avatar field stores the ID of the selected preset avatar image
    e.g. "avatar_1", "avatar_2" ... "avatar_10"
    The frontend maps these IDs to actual images.

Usage:
    from pydantic_models.user_models import UserCreate, UserUpdate, UserResponse
"""

from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Annotated, Literal, Optional
from datetime import datetime, timezone

# Same rule as USERNAME_REGEX in frontend/app/onboarding/page.tsx.
USERNAME_PATTERN = r"^[A-Za-z0-9_]{3,20}$"
DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}$"

Label = Annotated[str, Field(max_length=40)]    # one preference, restriction, tag or nutrient

class NutritionGoals(BaseModel):
    protein_g_per_meal: Optional[int] = Field(None, ge=0, le=1000)    # target grams of protein per meal
    dietary_focus: Optional[str] = Field(None, max_length=40)  # "balanced"|"high-protein"|"low-carb"|"weight-loss"|"muscle-gain"|"endurance"
    priority_nutrients: list[Label] = Field(default_factory=list, max_length=20)  # e.g. ["iron","calcium","vitamin-d","fiber","omega-3","b12"]

class BodyStats(BaseModel):
    """Optional stats for the fuel coach's calorie estimate. Never returned by
    the profile endpoint; read and written only via /api/coach/body."""
    weight_kg: Optional[float] = Field(None, ge=30, le=250)
    height_cm: Optional[float] = Field(None, ge=120, le=230)
    age: Optional[int] = Field(None, ge=16, le=90)
    sex: Optional[Literal["male", "female", "unspecified"]] = None

class MealLogEntry(BaseModel):
    title: str = Field(max_length=200)
    calories: int = Field(ge=0, le=10000)
    protein_g: Optional[int] = Field(None, ge=0, le=1000)
    fat_g: Optional[int] = Field(None, ge=0, le=1000)
    carbs_g: Optional[int] = Field(None, ge=0, le=1000)
    date: str = Field(pattern=DATE_PATTERN)     # YYYY-MM-DD
    dining_hall: str = Field(max_length=40)
    meal_period: str = Field(max_length=20)
    logged_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FavoriteDish(BaseModel):
    name: str = Field(max_length=200)
    station: str = Field(max_length=100)

class FavoriteCombo(BaseModel):
    title: str = Field(max_length=200)
    dining_hall: str = Field(max_length=40)
    date: str = Field(pattern=DATE_PATTERN)
    description: Optional[str] = Field(None, max_length=1000)
    approximate_calories: Optional[int] = Field(None, ge=0, le=10000)
    tags: list[Label] = Field(default_factory=list, max_length=20)
    dishes: list[FavoriteDish] = Field(default_factory=list, max_length=8)
    saved_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    username: str = Field(pattern=USERNAME_PATTERN)
    dietary_preferences: list[Label] = Field(default_factory=list, max_length=10)
    restrictions: list[Label] = Field(default_factory=list, max_length=20)
    avatar: Optional[str] = Field(None, max_length=40)
    preferred_calories_per_meal: Optional[int] = Field(None, ge=0, le=10000)
    default_dining_hall: Optional[str] = Field(None, max_length=40)
    nutrition_goals: Optional[NutritionGoals] = None

class UserUpdate(BaseModel):
    """Partial update: only fields present in the body are written, and an
    explicit null clears the optional ones (calories, hall, goals)."""
    model_config = ConfigDict(extra="forbid")

    username: Optional[str] = Field(None, pattern=USERNAME_PATTERN)
    dietary_preferences: Optional[list[Label]] = Field(None, max_length=10)
    restrictions: Optional[list[Label]] = Field(None, max_length=20)
    avatar: Optional[str] = Field(None, max_length=40)
    preferred_calories_per_meal: Optional[int] = Field(None, ge=0, le=10000)
    default_dining_hall: Optional[str] = Field(None, max_length=40)
    nutrition_goals: Optional[NutritionGoals] = None

    @field_validator("username", "dietary_preferences", "restrictions")
    @classmethod
    def _not_null(cls, v):
        # UserResponse requires these, so they can be changed but not cleared.
        if v is None:
            raise ValueError("may not be null")
        return v

# Response shapes for what's already stored. Limits are enforced when data is
# written; reading must not fail on entries saved before those limits existed.
class NutritionGoalsRecord(BaseModel):
    protein_g_per_meal: Optional[int] = None
    dietary_focus: Optional[str] = None
    priority_nutrients: list[str] = []

class MealLogRecord(BaseModel):
    title: str
    calories: int
    protein_g: Optional[int] = None
    fat_g: Optional[int] = None
    carbs_g: Optional[int] = None
    date: str
    dining_hall: str
    meal_period: str
    logged_at: datetime

class FavoriteRecord(BaseModel):
    title: str
    dining_hall: str
    date: str
    description: Optional[str] = None
    approximate_calories: Optional[int] = None
    tags: list[str] = []
    dishes: list[dict] = []
    saved_at: datetime

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
    nutrition_goals: Optional[NutritionGoalsRecord] = None
    meal_log: list[MealLogRecord] = []
    favorites: list[FavoriteRecord] = []
