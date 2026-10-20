"""Strava client: OAuth state and token exchange, encrypted token storage, and
recent workouts. The HTTP routes are in routers/strava.py; the fuel coach
reads workouts through this module.

Workouts are fetched when a plan needs them and kept in memory for five
minutes. They are never written to the database.

Setup (Fly secrets): STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET,
STRAVA_REDIRECT_URI (https://<frontend>/strava/callback) and STRAVA_TOKEN_KEY,
a Fernet key from:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

from __future__ import annotations

import json
import os
import secrets
import time
from urllib.parse import urlencode

import httpx
import structlog
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException

from database import coach_plans_collection, strava_links_collection

logger = structlog.get_logger()

STRAVA_CLIENT_ID = os.getenv("STRAVA_CLIENT_ID", "")
STRAVA_CLIENT_SECRET = os.getenv("STRAVA_CLIENT_SECRET", "")
STRAVA_REDIRECT_URI = os.getenv("STRAVA_REDIRECT_URI", "")
STRAVA_TOKEN_KEY = os.getenv("STRAVA_TOKEN_KEY", "")

AUTHORIZE_URL = "https://www.strava.com/oauth/authorize"
TOKEN_URL = "https://www.strava.com/oauth/token"
DEAUTHORIZE_URL = "https://www.strava.com/oauth/deauthorize"
API_URL = "https://www.strava.com/api/v3"

# Activities (including private ones, so a plan isn't missing half the week)
# and the profile, for weight if the athlete has set it.
SCOPES = "read,activity:read_all,profile:read_all"
ACTIVITY_SCOPES = {"activity:read", "activity:read_all"}
CONSENT_VERSION = "2026-10"
_STATE_TTL_S = 600
_CACHE_TTL_S = 300
_LOOKBACK_DAYS = 7

_activity_cache: dict[str, tuple[float, list[dict]]] = {}


class StravaUnavailable(Exception):
    """Strava is down, rate-limited, or unreachable. Not the student's fault."""


def configured() -> bool:
    if not (STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET and STRAVA_REDIRECT_URI and STRAVA_TOKEN_KEY):
        return False
    try:
        Fernet(STRAVA_TOKEN_KEY)
    except ValueError:
        logger.error("strava_bad_token_key", hint="STRAVA_TOKEN_KEY is not a valid Fernet key")
        return False
    return True


def _fernet() -> Fernet:
    return Fernet(STRAVA_TOKEN_KEY)


def seal(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def _open(value: str) -> str:
    return _fernet().decrypt(value.encode()).decode()


def make_state(uid: str) -> str:
    payload = {"uid": uid, "n": secrets.token_urlsafe(8), "v": CONSENT_VERSION}
    return seal(json.dumps(payload))


def read_state(state: str) -> dict:
    try:
        payload = json.loads(_fernet().decrypt(state.encode(), ttl=_STATE_TTL_S))
    except (InvalidToken, ValueError):
        raise HTTPException(status_code=400, detail="That Strava sign-in expired. Start again from your profile.")
    if not isinstance(payload, dict) or not payload.get("uid"):
        raise HTTPException(status_code=400, detail="That Strava sign-in expired. Start again from your profile.")
    return payload


def authorize_url(uid: str) -> str:
    """Strava's consent page, with a signed 10-minute `state` naming this user."""
    query = urlencode({
        "client_id": STRAVA_CLIENT_ID,
        "redirect_uri": STRAVA_REDIRECT_URI,
        "response_type": "code",
        "approval_prompt": "auto",
        "scope": SCOPES,
        "state": make_state(uid),
    })
    return f"{AUTHORIZE_URL}?{query}"


def _http() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=10)


async def post_token(data: dict) -> dict:
    """Call Strava's token endpoint. Raises HTTPException(400) when Strava
    rejects the grant, StravaUnavailable when Strava can't be reached."""
    try:
        async with _http() as http:
            r = await http.post(
                TOKEN_URL,
                data={"client_id": STRAVA_CLIENT_ID, "client_secret": STRAVA_CLIENT_SECRET, **data},
            )
    except httpx.HTTPError as e:
        raise StravaUnavailable(str(e)) from e
    if r.status_code in (400, 401, 403):
        logger.warning("strava_token_grant_rejected", status=r.status_code)
        raise HTTPException(status_code=400, detail="Strava didn't accept that sign-in. Try connecting again.")
    if r.status_code != 200:
        raise StravaUnavailable(f"token endpoint {r.status_code}")
    return r.json()


async def deauthorize(access_token: str) -> None:
    """Best effort: revoke our access at Strava. Local data is deleted either way."""
    try:
        async with _http() as http:
            await http.post(DEAUTHORIZE_URL, data={"access_token": access_token})
    except httpx.HTTPError as e:
        logger.warning("strava_deauthorize_failed", error=str(e))


async def get_athlete(access_token: str) -> dict:
    try:
        async with _http() as http:
            r = await http.get(f"{API_URL}/athlete", headers={"Authorization": f"Bearer {access_token}"})
        return r.json() if r.status_code == 200 else {}
    except (httpx.HTTPError, ValueError):
        return {}


async def save_link(uid: str, doc: dict) -> None:
    """Store a new link. Workouts and plans from before it are dropped."""
    await strava_links_collection.replace_one({"firebase_uid": uid}, doc, upsert=True)
    _activity_cache.pop(uid, None)
    await coach_plans_collection.delete_many({"firebase_uid": uid})


async def disconnect(uid: str) -> None:
    """Revoke our access at Strava (best effort), then delete everything we hold."""
    if configured():
        try:
            token = await get_access_token(uid)
        except StravaUnavailable:
            token = None
        if token:
            await deauthorize(token)
    await forget(uid)


async def forget(uid: str) -> None:
    _activity_cache.pop(uid, None)
    await strava_links_collection.delete_one({"firebase_uid": uid})
    await coach_plans_collection.delete_many({"firebase_uid": uid})


async def get_access_token(uid: str) -> str | None:
    """A valid access token for the student, refreshing it if needed.
    None means they aren't connected (or revoked access at Strava)."""
    doc = await strava_links_collection.find_one({"firebase_uid": uid})
    if not doc:
        return None
    try:
        if doc.get("expires_at", 0) > time.time() + 120:
            return _open(doc["access_token"])
        refresh = _open(doc["refresh_token"])
    except (InvalidToken, KeyError):
        # Stored with a different key. The tokens are unusable; start over.
        logger.warning("strava_tokens_undecryptable", action="dropping link")
        await forget(uid)
        return None
    try:
        tok = await post_token({"grant_type": "refresh_token", "refresh_token": refresh})
    except HTTPException:
        # Refresh token rejected: the athlete revoked BuffBites at Strava.
        await forget(uid)
        return None
    await _store_tokens(uid, tok, refresh)
    return tok["access_token"]


async def _store_tokens(uid: str, tok: dict, old_refresh: str) -> None:
    await strava_links_collection.update_one(
        {"firebase_uid": uid},
        {"$set": {
            "access_token": seal(tok["access_token"]),
            "refresh_token": seal(tok.get("refresh_token") or old_refresh),
            "expires_at": int(tok.get("expires_at") or time.time() + 3600),
        }},
    )


# ── Webhook support (routers/strava_webhook.py) ────────────────────────────

async def uids_for_athlete(athlete_id: int) -> list[str]:
    """BuffBites accounts linked to a Strava athlete (normally one)."""
    cursor = strava_links_collection.find({"athlete_id": athlete_id}, {"firebase_uid": 1})
    return [d["firebase_uid"] for d in await cursor.to_list(10)]


def invalidate(uid: str) -> None:
    """A workout was added, edited or deleted: drop the cached workouts so the
    next budget or plan reads the new data. Cached plans stay: their key
    includes the day's workouts, so a changed day gets a new plan anyway."""
    _activity_cache.pop(uid, None)


async def still_authorized(uid: str) -> bool:
    """Ask Strava whether our refresh token still works. Webhook events aren't
    signed, so a "revoked" event is only acted on once Strava confirms it.
    If Strava can't be reached we keep the link; the next real request will
    notice a revocation on its own."""
    doc = await strava_links_collection.find_one({"firebase_uid": uid})
    if not doc:
        return False
    try:
        refresh = _open(doc["refresh_token"])
    except (InvalidToken, KeyError):
        return False
    try:
        tok = await post_token({"grant_type": "refresh_token", "refresh_token": refresh})
    except HTTPException:
        return False
    except StravaUnavailable:
        return True
    await _store_tokens(uid, tok, refresh)
    return True


_ACTIVITY_FIELDS = (
    "name", "sport_type", "type", "start_date_local", "moving_time", "elapsed_time",
    "distance", "total_elevation_gain", "kilojoules",
)


async def recent_activities(uid: str, days: int = _LOOKBACK_DAYS) -> list[dict] | None:
    """The student's activities from the last `days` days, trimmed to the fields
    the energy model uses. None if they haven't connected Strava."""
    hit = _activity_cache.get(uid)
    if hit and time.monotonic() - hit[0] < _CACHE_TTL_S:
        return hit[1]
    token = await get_access_token(uid)
    if token is None:
        return None
    # A day of slack on each side; the coach filters by local date.
    after = int(time.time()) - (days + 1) * 86400
    try:
        async with _http() as http:
            r = await http.get(
                f"{API_URL}/athlete/activities",
                params={"after": after, "per_page": 100},
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError as e:
        raise StravaUnavailable(str(e)) from e
    if r.status_code == 401:
        await forget(uid)
        return None
    if r.status_code != 200:
        raise StravaUnavailable(f"activities {r.status_code}")
    try:
        raw = r.json()
    except ValueError as e:
        raise StravaUnavailable("activities: bad JSON") from e
    activities = [{k: a.get(k) for k in _ACTIVITY_FIELDS} for a in raw if isinstance(a, dict)]
    if len(_activity_cache) > 2000:
        _activity_cache.clear()
    _activity_cache[uid] = (time.monotonic(), activities)
    return activities


async def get_link(uid: str) -> dict | None:
    """The link without its tokens: athlete name, weight/sex from Strava, consent."""
    return await strava_links_collection.find_one(
        {"firebase_uid": uid}, {"access_token": 0, "refresh_token": 0}
    )
