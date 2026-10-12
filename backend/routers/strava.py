"""Strava link: opt-in OAuth, encrypted tokens, recent workouts.

Nothing is read from Strava until the student taps Connect and agrees to the
consent sheet. The flow:

    1. POST /api/strava/connect {consent: true}  (signed in)
       → Strava's authorize URL, with a signed 10-minute `state` naming this user.
    2. Strava sends the browser back to the frontend's /strava/callback.
    3. The frontend posts {code, state, scope} to /api/strava/complete with the
       student's Firebase token. The state must name *this* user, so nobody can
       attach their Strava to someone else's account. The code is exchanged and
       the tokens are stored encrypted.
    4. DELETE /api/strava revokes our access at Strava and deletes everything
       we stored for the student, including cached fuel plans.

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
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from database import coach_plans_collection, strava_links_collection
from rate_limit import SlidingWindowLimiter

router = APIRouter(prefix="/api/strava", tags=["strava"])

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
_ACTIVITY_SCOPES = {"activity:read", "activity:read_all"}
CONSENT_VERSION = "2026-10"
_STATE_TTL_S = 600
_CACHE_TTL_S = 300
_LOOKBACK_DAYS = 7

_limiter = SlidingWindowLimiter(limit=10, window_seconds=60, detail="Slow down a little. Try again in a minute.")
_activity_cache: dict[str, tuple[float, list[dict]]] = {}


class StravaUnavailable(Exception):
    """Strava is down, rate-limited, or unreachable. Not the student's fault."""


def configured() -> bool:
    if not (STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET and STRAVA_REDIRECT_URI and STRAVA_TOKEN_KEY):
        return False
    try:
        Fernet(STRAVA_TOKEN_KEY)
    except ValueError:
        print("[STRAVA] STRAVA_TOKEN_KEY is not a valid Fernet key", file=sys.stderr)
        return False
    return True


def _require_configured() -> None:
    if not configured():
        raise HTTPException(status_code=503, detail="Strava isn't set up on this server yet.")


def _fernet() -> Fernet:
    return Fernet(STRAVA_TOKEN_KEY)


def _seal(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def _open(value: str) -> str:
    return _fernet().decrypt(value.encode()).decode()


def make_state(uid: str) -> str:
    payload = {"uid": uid, "n": secrets.token_urlsafe(8), "v": CONSENT_VERSION}
    return _seal(json.dumps(payload))


def read_state(state: str) -> dict:
    try:
        payload = json.loads(_fernet().decrypt(state.encode(), ttl=_STATE_TTL_S))
    except (InvalidToken, ValueError):
        raise HTTPException(status_code=400, detail="That Strava sign-in expired. Start again from your profile.")
    if not isinstance(payload, dict) or not payload.get("uid"):
        raise HTTPException(status_code=400, detail="That Strava sign-in expired. Start again from your profile.")
    return payload


def _http() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=10)


async def _post_token(data: dict) -> dict:
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
        print(f"[STRAVA] token grant rejected: {r.status_code}", file=sys.stderr)
        raise HTTPException(status_code=400, detail="Strava didn't accept that sign-in. Try connecting again.")
    if r.status_code != 200:
        raise StravaUnavailable(f"token endpoint {r.status_code}")
    return r.json()


async def _deauthorize(access_token: str) -> None:
    """Best effort: revoke our access at Strava. Local data is deleted either way."""
    try:
        async with _http() as http:
            await http.post(DEAUTHORIZE_URL, data={"access_token": access_token})
    except httpx.HTTPError as e:
        print(f"[STRAVA] deauthorize failed: {e}", file=sys.stderr)


async def _get_athlete(access_token: str) -> dict:
    try:
        async with _http() as http:
            r = await http.get(f"{API_URL}/athlete", headers={"Authorization": f"Bearer {access_token}"})
        return r.json() if r.status_code == 200 else {}
    except (httpx.HTTPError, ValueError):
        return {}


async def _forget(uid: str) -> None:
    _activity_cache.pop(uid, None)
    await strava_links_collection.delete_one({"firebase_uid": uid})
    await coach_plans_collection.delete_many({"firebase_uid": uid})


async def _access_token(uid: str) -> str | None:
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
        print("[STRAVA] stored tokens can't be decrypted; dropping link", file=sys.stderr)
        await _forget(uid)
        return None
    try:
        tok = await _post_token({"grant_type": "refresh_token", "refresh_token": refresh})
    except HTTPException:
        # Refresh token rejected: the athlete revoked BuffBites at Strava.
        await _forget(uid)
        return None
    await strava_links_collection.update_one(
        {"firebase_uid": uid},
        {"$set": {
            "access_token": _seal(tok["access_token"]),
            "refresh_token": _seal(tok.get("refresh_token") or refresh),
            "expires_at": int(tok.get("expires_at") or time.time() + 3600),
        }},
    )
    return tok["access_token"]


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
    token = await _access_token(uid)
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
        await _forget(uid)
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


# ── Routes ─────────────────────────────────────────────────────────────────

class StravaStatus(BaseModel):
    available: bool
    connected: bool
    athlete_name: str | None = None
    connected_at: datetime | None = None
    scopes: list[str] = []


class ConnectRequest(BaseModel):
    consent: bool = Field(description="True once the student has agreed to the consent sheet")


class ConnectResponse(BaseModel):
    url: str


class CompleteRequest(BaseModel):
    code: str = Field(min_length=1, max_length=200)
    state: str = Field(min_length=1, max_length=1000)
    scope: str = Field(default="", max_length=200)


def _status(doc: dict | None) -> StravaStatus:
    if not doc:
        return StravaStatus(available=configured(), connected=False)
    return StravaStatus(
        available=configured(),
        connected=True,
        athlete_name=doc.get("athlete_name"),
        connected_at=doc.get("connected_at"),
        scopes=doc.get("scopes") or [],
    )


@router.get("/status", response_model=StravaStatus)
async def status(current_user: dict = Depends(get_current_user)) -> StravaStatus:
    return _status(await get_link(current_user["uid"]))


@router.post("/connect", response_model=ConnectResponse)
async def connect(req: ConnectRequest, current_user: dict = Depends(get_current_user)) -> ConnectResponse:
    _require_configured()
    if req.consent is not True:
        raise HTTPException(status_code=400, detail="Agree to the consent sheet first.")
    _limiter.check(current_user["uid"])
    query = urlencode({
        "client_id": STRAVA_CLIENT_ID,
        "redirect_uri": STRAVA_REDIRECT_URI,
        "response_type": "code",
        "approval_prompt": "auto",
        "scope": SCOPES,
        "state": make_state(current_user["uid"]),
    })
    return ConnectResponse(url=f"{AUTHORIZE_URL}?{query}")


@router.post("/complete", response_model=StravaStatus)
async def complete(req: CompleteRequest, current_user: dict = Depends(get_current_user)) -> StravaStatus:
    _require_configured()
    uid = current_user["uid"]
    _limiter.check(uid)
    state = read_state(req.state)
    if state["uid"] != uid:
        raise HTTPException(
            status_code=403,
            detail="This Strava link was started from a different account. Start again from your profile.",
        )

    try:
        tok = await _post_token({"code": req.code, "grant_type": "authorization_code"})
    except StravaUnavailable as e:
        print(f"[STRAVA] code exchange failed: {e}", file=sys.stderr)
        raise HTTPException(status_code=503, detail="Couldn't reach Strava. Try again in a minute.")

    granted = {s.strip() for s in req.scope.split(",") if s.strip()}
    if not granted & _ACTIVITY_SCOPES:
        await _deauthorize(tok["access_token"])
        raise HTTPException(
            status_code=400,
            detail="BuffBites needs to see your activities. Connect again and leave the activity box checked.",
        )

    athlete = tok.get("athlete") or {}
    if "profile:read_all" in granted:
        athlete = {**athlete, **(await _get_athlete(tok["access_token"]))}
    weight = athlete.get("weight")
    sex = {"M": "male", "F": "female"}.get(athlete.get("sex") or "")

    now = datetime.now(timezone.utc)
    doc = {
        "firebase_uid": uid,
        "athlete_id": athlete.get("id"),
        "athlete_name": (athlete.get("firstname") or "").strip()[:40] or None,
        "scopes": sorted(granted),
        "access_token": _seal(tok["access_token"]),
        "refresh_token": _seal(tok["refresh_token"]),
        "expires_at": int(tok.get("expires_at") or time.time() + 3600),
        "weight_kg": float(weight) if isinstance(weight, (int, float)) and 30 <= weight <= 250 else None,
        "sex": sex,
        "consent": {"version": state.get("v", CONSENT_VERSION), "granted_at": now},
        "connected_at": now,
    }
    await strava_links_collection.replace_one({"firebase_uid": uid}, doc, upsert=True)
    _activity_cache.pop(uid, None)
    await coach_plans_collection.delete_many({"firebase_uid": uid})
    return _status(doc)


@router.delete("", response_model=StravaStatus)
async def disconnect(current_user: dict = Depends(get_current_user)) -> StravaStatus:
    uid = current_user["uid"]
    if configured():
        try:
            token = await _access_token(uid)
        except StravaUnavailable:
            token = None
        if token:
            await _deauthorize(token)
    await _forget(uid)
    return StravaStatus(available=configured(), connected=False)
