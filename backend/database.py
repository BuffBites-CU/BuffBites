"""
MongoDB connection and collection references for BuffBites.

Creates a single shared AsyncIOMotorClient used across the entire app.
Import individual collections directly into routers as needed.

Collections:
    users_collection       — user profiles created after Firebase sign-in
    combos_collection      — published community combos (expire after 24hrs)
    comments_collection    — comments on community combos
    drafts_collection      — saved drafts under user profile (never expire)
    combo_cache_collection — AI-generated combos cached by (dining, date, prefs)

Usage:
    from database import users_collection, combos_collection, drafts_collection
"""

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING
from dotenv import load_dotenv
import certifi
import os

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL") or os.getenv("MONGO_URI")
if not MONGO_URL:
    raise RuntimeError("MONGO_URL env var is not set — copy backend/.env.example to backend/.env")
APP_NAME = os.getenv("APP_NAME", "buffbites")

client = AsyncIOMotorClient(MONGO_URL, tlsCAFile=certifi.where())
db = client[APP_NAME]

# Collections
users_collection = db["users"]
combos_collection = db["combos"]
comments_collection = db["comments"]
drafts_collection = db["drafts"]
combo_cache_collection = db["combo_cache"]


async def ensure_indexes() -> None:
    """Create indexes that must exist before the app serves traffic.

    Idempotent — MongoDB skips indexes that already exist, so this is safe to
    run on every startup. Each collection is indexed on the fields it's actually
    queried/sorted by, and the two TTL indexes auto-evict expired documents.
    """
    # users — looked up by firebase_uid on nearly every request; username must
    # stay unique across accounts.
    await users_collection.create_index("firebase_uid", unique=True)
    await users_collection.create_index("username", unique=True)

    # combos (community feed) — published combos live for 24h (TTL), and are
    # filtered by hall / author and shown newest-first.
    await combos_collection.create_index("expires_at", expireAfterSeconds=0)
    await combos_collection.create_index("dining_hall")
    await combos_collection.create_index("author_firebase_uid")
    await combos_collection.create_index([("created_at", DESCENDING)])

    # comments — always fetched for a single combo, oldest-first.
    await comments_collection.create_index("combo_id")

    # drafts — listed per user.
    await drafts_collection.create_index("firebase_uid")

    # combo_cache — keyed lookup with a 24h TTL on AI-generated combos.
    await combo_cache_collection.create_index("key", unique=True)
    await combo_cache_collection.create_index("expires_at", expireAfterSeconds=0)