"""
MongoDB connection and collection references for BuffBites.

Creates a single shared AsyncIOMotorClient used across the entire app.
Import individual collections directly into routers as needed.

Collections:
    users_collection       — user profiles created after Firebase sign-in
    combos_collection      — published community combos (expire after 24hrs)
    drafts_collection      — saved drafts under user profile (never expire)
    combo_cache_collection — AI-generated combos cached by (dining, date, prefs)

Usage:
    from database import users_collection, combos_collection, drafts_collection
"""

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import certifi
import os

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL") or os.getenv("MONGO_URI")
if not MONGO_URL:
    raise RuntimeError("MONGO_URL env var is not set — copy backend/.env.example to backend/.env")
APP_NAME = os.getenv("APP_NAME", "combos")

client = AsyncIOMotorClient(MONGO_URL, tlsCAFile=certifi.where())
db = client[APP_NAME]

# Collections
users_collection = db["users"]
combos_collection = db["combos"]
drafts_collection = db["drafts"]
combo_cache_collection = db["combo_cache"]


async def ensure_indexes() -> None:
    """Create indexes that must exist before the app serves traffic.

    The combo cache uses a MongoDB TTL index on `expires_at` so stale
    AI-generated combos are evicted automatically once the day passes.
    """
    await combo_cache_collection.create_index("key", unique=True)
    await combo_cache_collection.create_index("expires_at", expireAfterSeconds=0)