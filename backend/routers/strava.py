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

The OAuth, token and workout code lives in strava_client.py; this module is
only the HTTP routes.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import strava_client
from auth import get_current_user
from rate_limit import SlidingWindowLimiter

router = APIRouter(prefix="/api/strava", tags=["strava"])
logger = structlog.get_logger()

_limiter = SlidingWindowLimiter(limit=10, window_seconds=60, detail="Slow down a little. Try again in a minute.")


def _require_configured() -> None:
    if not strava_client.configured():
        raise HTTPException(status_code=503, detail="Strava isn't set up on this server yet.")


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
        return StravaStatus(available=strava_client.configured(), connected=False)
    return StravaStatus(
        available=strava_client.configured(),
        connected=True,
        athlete_name=doc.get("athlete_name"),
        connected_at=doc.get("connected_at"),
        scopes=doc.get("scopes") or [],
    )


@router.get("/status", response_model=StravaStatus)
async def status(current_user: dict = Depends(get_current_user)) -> StravaStatus:
    return _status(await strava_client.get_link(current_user["uid"]))


@router.post("/connect", response_model=ConnectResponse)
async def connect(req: ConnectRequest, current_user: dict = Depends(get_current_user)) -> ConnectResponse:
    _require_configured()
    if req.consent is not True:
        raise HTTPException(status_code=400, detail="Agree to the consent sheet first.")
    _limiter.check(current_user["uid"])
    return ConnectResponse(url=strava_client.authorize_url(current_user["uid"]))


@router.post("/complete", response_model=StravaStatus)
async def complete(req: CompleteRequest, current_user: dict = Depends(get_current_user)) -> StravaStatus:
    _require_configured()
    uid = current_user["uid"]
    _limiter.check(uid)
    state = strava_client.read_state(req.state)
    if state["uid"] != uid:
        raise HTTPException(
            status_code=403,
            detail="This Strava link was started from a different account. Start again from your profile.",
        )

    try:
        tok = await strava_client.post_token({"code": req.code, "grant_type": "authorization_code"})
    except strava_client.StravaUnavailable as e:
        logger.warning("strava_code_exchange_failed", error=str(e))
        raise HTTPException(status_code=503, detail="Couldn't reach Strava. Try again in a minute.")

    granted = {s.strip() for s in req.scope.split(",") if s.strip()}
    if not granted & strava_client.ACTIVITY_SCOPES:
        await strava_client.deauthorize(tok["access_token"])
        raise HTTPException(
            status_code=400,
            detail="BuffBites needs to see your activities. Connect again and leave the activity box checked.",
        )

    athlete = tok.get("athlete") or {}
    if "profile:read_all" in granted:
        athlete = {**athlete, **(await strava_client.get_athlete(tok["access_token"]))}
    weight = athlete.get("weight")
    sex = {"M": "male", "F": "female"}.get(athlete.get("sex") or "")

    now = datetime.now(timezone.utc)
    doc = {
        "firebase_uid": uid,
        "athlete_id": athlete.get("id"),
        "athlete_name": (athlete.get("firstname") or "").strip()[:40] or None,
        "scopes": sorted(granted),
        "access_token": strava_client.seal(tok["access_token"]),
        "refresh_token": strava_client.seal(tok["refresh_token"]),
        "expires_at": int(tok.get("expires_at") or time.time() + 3600),
        "weight_kg": float(weight) if isinstance(weight, (int, float)) and 30 <= weight <= 250 else None,
        "sex": sex,
        "consent": {"version": state.get("v", strava_client.CONSENT_VERSION), "granted_at": now},
        "connected_at": now,
    }
    await strava_client.save_link(uid, doc)
    return _status(doc)


@router.delete("", response_model=StravaStatus)
async def disconnect(current_user: dict = Depends(get_current_user)) -> StravaStatus:
    await strava_client.disconnect(current_user["uid"])
    return StravaStatus(available=strava_client.configured(), connected=False)
