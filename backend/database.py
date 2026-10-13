"""
MongoDB connection and collection references for BuffBites.

Creates a single shared AsyncIOMotorClient used across the entire app.
Import individual collections directly into routers as needed.

Collections:
    users_collection       — user profiles created after Firebase sign-in
    combos_collection      — published community combos (in the feed for 24hrs,
                             deleted after COMBO_RETENTION so weekly trends work)
    comments_collection    — comments on community combos (deleted with their combo)
    combo_cache_collection — AI-generated combos cached by (dining, date, prefs)
    strava_links_collection — opt-in Strava links (tokens encrypted), one per user
    coach_plans_collection — fuel-coach day plans cached per user for a few hours

Usage:
    from database import users_collection, combos_collection, comments_collection
"""

from datetime import datetime, timedelta, timezone

import certifi
import os
import structlog
from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import DESCENDING
from pymongo.errors import OperationFailure

load_dotenv()

logger = structlog.get_logger()

MONGO_URL = os.getenv("MONGO_URL") or os.getenv("MONGO_URI")
if not MONGO_URL:
    raise RuntimeError("MONGO_URL env var is not set — copy backend/.env.example to backend/.env")
APP_NAME = os.getenv("APP_NAME", "buffbites")

# tz_aware: datetimes come back as UTC-aware, so the API serializes them with
# an offset and clients don't read them as local time.
client = AsyncIOMotorClient(MONGO_URL, tlsCAFile=certifi.where(), tz_aware=True)
db = client[APP_NAME]

# Collections
users_collection = db["users"]
combos_collection = db["combos"]
comments_collection = db["comments"]
combo_cache_collection = db["combo_cache"]
strava_links_collection = db["strava_links"]
coach_plans_collection = db["coach_plans"]

# How long a community combo (and its comments) is kept after it's published.
# The feed only shows combos for 24h (expires_at); weekly trends need the rest.
COMBO_RETENTION = timedelta(days=7)


def object_id_or_404(value: str) -> ObjectId:
    """Parse an id from the URL; a malformed one can't match anything, so 404."""
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=404, detail="Not found")


async def profile_username(firebase_uid: str) -> str | None:
    """The username the user chose at onboarding, or None if they have no profile."""
    doc = await users_collection.find_one({"firebase_uid": firebase_uid}, {"username": 1})
    return (doc or {}).get("username") or None


async def _create_index(collection, keys, **kwargs) -> None:
    """Create one index. A server-side failure (bad data, conflicting options)
    is logged so the remaining indexes still get built; connection errors
    propagate, since every later index would fail the same way."""
    try:
        await collection.create_index(keys, **kwargs)
    except OperationFailure as e:
        logger.warning("index_create_failed", collection=collection.name, keys=str(keys), error=str(e))


async def _drop_ttl_index(collection, field: str) -> None:
    """Drop a single-field TTL index on `field`, so it can be recreated without expiry."""
    for name, info in (await collection.index_information()).items():
        if "expireAfterSeconds" in info and [k for k, _ in info["key"]] == [field]:
            try:
                await collection.drop_index(name)
                logger.info("index_dropped", collection=collection.name, index=name)
            except OperationFailure as e:
                logger.warning("index_drop_failed", collection=collection.name, index=name, error=str(e))


async def ensure_indexes() -> None:
    """Create indexes that must exist before the app serves traffic.

    Idempotent — MongoDB skips indexes that already exist, so this is safe to
    run on every startup. Each collection is indexed on the fields it's actually
    queried/sorted by, and the TTL indexes auto-evict expired documents.
    """
    # users — looked up by firebase_uid on nearly every request; username must
    # stay unique across accounts.
    await _create_index(users_collection, "firebase_uid", unique=True)
    await _create_index(users_collection, "username", unique=True)

    # combos (community feed) — shown while expires_at (24h) is in the future,
    # kept for COMBO_RETENTION after created_at for weekly trends, and filtered
    # by hall / author and shown newest-first. Older deploys put the TTL on
    # expires_at, which deleted combos after 24h; drop it before re-indexing.
    await _drop_ttl_index(combos_collection, "expires_at")
    await _create_index(combos_collection, "expires_at")
    await _create_index(combos_collection, "created_at", expireAfterSeconds=int(COMBO_RETENTION.total_seconds()))
    await _create_index(combos_collection, "dining_hall")
    await _create_index(combos_collection, "author_firebase_uid")
    await _create_index(combos_collection, [("created_at", DESCENDING)])

    # comments — always fetched for a single combo; expire with their combo.
    await _create_index(comments_collection, "combo_id")
    await _create_index(comments_collection, "expires_at", expireAfterSeconds=0)
    # Comments written before expires_at existed would otherwise never expire.
    try:
        await comments_collection.update_many(
            {"expires_at": {"$exists": False}},
            {"$set": {"expires_at": datetime.now(timezone.utc) + COMBO_RETENTION}},
        )
    except Exception as e:
        logger.warning("comment_expiry_backfill_failed", error=str(e))

    # combo_cache — keyed lookup with a 24h TTL on AI-generated combos.
    await _create_index(combo_cache_collection, "key", unique=True)
    await _create_index(combo_cache_collection, "expires_at", expireAfterSeconds=0)

    # strava_links — one per user; deleted outright on disconnect.
    await _create_index(strava_links_collection, "firebase_uid", unique=True)
    # Strava webhook events name the athlete, not the BuffBites user.
    await _create_index(strava_links_collection, "athlete_id")

    # coach_plans — keyed lookup, short TTL, and removable per user on disconnect.
    await _create_index(coach_plans_collection, "key", unique=True)
    await _create_index(coach_plans_collection, "expires_at", expireAfterSeconds=0)
    await _create_index(coach_plans_collection, "firebase_uid")
