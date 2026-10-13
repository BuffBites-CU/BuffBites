"""Strava webhook: the push side of the Strava data pipeline.

Pull: the coach fetches a student's last 7 days of activities when it needs
them and keeps them for five minutes.

Push: one subscription per Strava app (created with
scripts/strava_webhook.py) makes Strava POST to
/api/strava/webhook/<STRAVA_WEBHOOK_VERIFY_TOKEN> whenever a connected athlete
creates, edits or deletes an activity, or revokes BuffBites' access. Strava's
events aren't signed, so the secret in the URL is what proves they came from
Strava.

- Activity events drop that student's cached workouts, so the next look at
  the fuel card includes the new workout (plans are keyed by the day's
  workouts, so a stale plan is never served).
- A revocation deletes the link and everything stored with it, but only after
  Strava confirms the student's token really stopped working, at most once
  per student every ten minutes.

Strava expects a 200 within two seconds, so events are handled in the
background after the response is sent.
"""

from __future__ import annotations

import hmac
import os
import time

import structlog
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from pydantic import BaseModel

import strava_client
from rate_limit import SlidingWindowLimiter, client_ip

router = APIRouter(prefix="/api/strava/webhook", tags=["strava"])
logger = structlog.get_logger()

STRAVA_WEBHOOK_VERIFY_TOKEN = os.getenv("STRAVA_WEBHOOK_VERIFY_TOKEN", "")
# Revoke events trigger a token check at Strava; at most one per student per
# window, however many (possibly spoofed) events arrive.
_REVOKE_CHECK_EVERY_S = 600

_limiter = SlidingWindowLimiter(limit=300, window_seconds=60, detail="Too many webhook calls.")
_last_revoke_check: dict[str, float] = {}


class StravaEvent(BaseModel):
    object_type: str
    object_id: int
    aspect_type: str
    owner_id: int
    subscription_id: int
    event_time: int = 0
    updates: dict = {}


def _check_key(key: str) -> None:
    """Strava's events aren't signed, so the callback URL carries the secret
    (STRAVA_WEBHOOK_VERIFY_TOKEN); only Strava learns it, at registration."""
    if not STRAVA_WEBHOOK_VERIFY_TOKEN or not hmac.compare_digest(key, STRAVA_WEBHOOK_VERIFY_TOKEN):
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/{key}")
async def validate_subscription(
    key: str,
    mode: str = Query("", alias="hub.mode"),
    challenge: str = Query("", alias="hub.challenge", max_length=200),
    verify_token: str = Query("", alias="hub.verify_token", max_length=200),
) -> dict:
    """Strava calls this once when the subscription is created."""
    _check_key(key)
    if mode != "subscribe" or not hmac.compare_digest(verify_token, STRAVA_WEBHOOK_VERIFY_TOKEN):
        raise HTTPException(status_code=403, detail="Verification failed")
    return {"hub.challenge": challenge}


def _revoke_check_due(uid: str) -> bool:
    now = time.monotonic()
    if now - _last_revoke_check.get(uid, -_REVOKE_CHECK_EVERY_S) < _REVOKE_CHECK_EVERY_S:
        return False
    if len(_last_revoke_check) > 10_000:
        _last_revoke_check.clear()
    _last_revoke_check[uid] = now
    return True


async def handle_event(event: StravaEvent) -> None:
    revoked = event.object_type == "athlete" and str(event.updates.get("authorized", "")).lower() == "false"
    for uid in await strava_client.uids_for_athlete(event.owner_id):
        if revoked:
            if not _revoke_check_due(uid):
                continue
            if await strava_client.still_authorized(uid):
                logger.warning("strava_webhook_unconfirmed_revoke", owner_id=event.owner_id)
                continue
            await strava_client.forget(uid)
            logger.info("strava_webhook_revoked")
        elif event.object_type == "activity":
            strava_client.invalidate(uid)


@router.post("/{key}")
async def receive_event(key: str, event: StravaEvent, request: Request, background: BackgroundTasks) -> dict:
    _check_key(key)
    _limiter.check(client_ip(request))
    background.add_task(handle_event, event)
    return {"ok": True}
