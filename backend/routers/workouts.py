"""Workouts a student logs by hand, for the fuel coach.

An alternative to the Strava link: the student enters sport, date, minutes and
(optionally) distance and effort. energy.py turns that into calories exactly
as it does for Strava workouts, and the coach adds them to the day's target.

Only the owner can read, add or delete their entries. Entries cover the last
week (the window the coach looks at) and expire after 90 days.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import energy
from auth import get_current_user
from database import manual_workouts_collection, object_id_or_404
from menu_rules import check_date, today_mt

router = APIRouter(prefix="/api/workouts", tags=["workouts"])

LOOKBACK_DAYS = 6          # today plus the six days before it
MAX_PER_DAY = 10
MAX_STORED = 200
_RETENTION = timedelta(days=90)

Sport = Literal[tuple(energy.MANUAL_SPORTS)]  # type: ignore[valid-type]


class WorkoutIn(BaseModel):
    sport: Sport
    date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$", description="YYYY-MM-DD; defaults to today")
    start_time: str | None = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$", description="Local HH:MM")
    minutes: float = Field(ge=5, le=720)
    distance_km: float = Field(0, ge=0, le=300)
    effort: Literal["light", "moderate", "hard"] = "moderate"


class WorkoutRecord(BaseModel):
    id: str
    sport: str
    label: str
    date: str
    start_time: str | None
    minutes: float
    distance_km: float
    effort: str


def _record(doc: dict) -> WorkoutRecord:
    return WorkoutRecord(
        id=str(doc["_id"]), sport=doc["sport"], label=energy.MANUAL_SPORTS.get(doc["sport"], doc["sport"]),
        date=doc["date"], start_time=doc.get("start_time"), minutes=doc["minutes"],
        distance_km=doc.get("distance_km") or 0, effort=doc.get("effort", "moderate"),
    )


async def fetch_range(uid: str, start: str, end: str) -> list[dict]:
    """The student's manual entries with start <= date <= end (YYYY-MM-DD)."""
    cursor = manual_workouts_collection.find(
        {"firebase_uid": uid, "date": {"$gte": start, "$lte": end}}
    ).sort([("date", -1), ("start_time", -1)])
    return await cursor.to_list(MAX_PER_DAY * (LOOKBACK_DAYS + 2))


@router.get("", response_model=list[WorkoutRecord])
async def list_workouts(current_user: dict = Depends(get_current_user)) -> list[WorkoutRecord]:
    today = today_mt()
    start = (datetime.fromisoformat(today) - timedelta(days=LOOKBACK_DAYS)).date().isoformat()
    return [_record(d) for d in await fetch_range(current_user["uid"], start, today)]


@router.post("", response_model=WorkoutRecord, status_code=201)
async def add_workout(w: WorkoutIn, current_user: dict = Depends(get_current_user)) -> WorkoutRecord:
    uid = current_user["uid"]
    day = check_date(w.date, -LOOKBACK_DAYS, 0, "Log workouts from the last 7 days.")
    if await manual_workouts_collection.count_documents({"firebase_uid": uid, "date": day}) >= MAX_PER_DAY:
        raise HTTPException(status_code=429, detail="That's plenty of workouts for one day.")
    if await manual_workouts_collection.count_documents({"firebase_uid": uid}) >= MAX_STORED:
        raise HTTPException(status_code=429, detail="Delete some old workouts first.")
    now = datetime.now(timezone.utc)
    doc = {
        "firebase_uid": uid, "sport": w.sport, "date": day, "start_time": w.start_time,
        "minutes": w.minutes, "distance_km": w.distance_km, "effort": w.effort,
        "created_at": now, "expires_at": now + _RETENTION,
    }
    result = await manual_workouts_collection.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _record(doc)


@router.delete("/{workout_id}")
async def delete_workout(workout_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    result = await manual_workouts_collection.delete_one(
        {"_id": object_id_or_404(workout_id), "firebase_uid": current_user["uid"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"message": "Workout deleted"}
