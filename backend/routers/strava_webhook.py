"""Strava webhook: the push side of the Strava data pipeline.

Pull: the coach fetches a student's last 7 days of activities when it needs
them and keeps them for five minutes.

Push: one subscription per Strava app (created with
scripts/strava_webhook.py) makes Strava POST here whenever a connected
athlete creates, edits or deletes an activity, or revokes BuffBites' access.

- Activity events drop that student's cached workouts and fuel plans, so the
  next look at the fuel card includes the new workout right away.
- A revocation deletes the link and everything stored with it. Strava's
  webhooks aren't signed, so before deleting anything we confirm with Strava
  that the student's token really stopped working.

Strava expects a 200 within two seconds, so events are handled in the
background after the response is sent.
"""

from __future__ import annotations

import os

import structlog
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from pydantic import BaseModel

import strava_client
from rate_limit import SlidingWindowLimiter, client_ip

router = APIRouter(prefix="/api/strava/webhook", tags=["strava"])
logger = structlog.get_logger()

STRAVA_WEBHOOK_VERIFY_TOKEN = os.getenv("STRAVA_WEBHOOK_VERIFY_TOKEN", "")
# Optional: once set to the id `scripts/strava_webhook.py view` prints, events
# for any other subscription are ignored.
STRAVA_WEBHOOK_SUBSCRIPTION_ID = os.getenv("STRAVA_WEBHOOK_SUBSCRIPTION_ID", "")

_limiter = SlidingWindowLimiter(limit=300, window_seconds=60, detail="Too many webhook calls.")


class StravaEvent(BaseModel):
    object_type: str
    object_id: int
    aspect_type: str
    owner_id: int
    subscription_id: int
    event_time: int = 0
    updates: dict = {}


@router.get("")
async def validate_subscription(
    mode: str = Query("", alias="hub.mode"),
    challenge: str = Query("", alias="hub.challenge", max_length=200),
    verify_token: str = Query("", alias="hub.verify_token", max_length=200),
) -> dict:
    """Strava calls this once when the subscription is created."""
    if not STRAVA_WEBHOOK_VERIFY_TOKEN or mode != "subscribe" or verify_token != STRAVA_WEBHOOK_VERIFY_TOKEN:
        raise HTTPException(status_code=403, detail="Verification failed")
    return {"hub.challenge": challenge}


async def handle_event(event: StravaEvent) -> None:
    revoked = event.object_type == "athlete" and str(event.updates.get("authorized", "")).lower() == "false"
    for uid in await strava_client.uids_for_athlete(event.owner_id):
        if revoked:
            if await strava_client.still_authorized(uid):
                logger.warning("strava_webhook_unconfirmed_revoke", owner_id=event.owner_id)
                continue
            await strava_client.forget(uid)
            logger.info("strava_webhook_revoked")
        elif event.object_type == "activity":
            await strava_client.invalidate(uid)


@router.post("")
async def receive_event(event: StravaEvent, request: Request, background: BackgroundTasks) -> dict:
    _limiter.check(client_ip(request))
    if STRAVA_WEBHOOK_SUBSCRIPTION_ID and str(event.subscription_id) != STRAVA_WEBHOOK_SUBSCRIPTION_ID:
        return {"ok": True}
    background.add_task(handle_event, event)
    return {"ok": True}
