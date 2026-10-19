"""Dine together: chat rooms for each hall and interest, and open seats.

Rooms
    hall:<key>       one per open dining hall
    interest:<key>   one per interest in chat_rules.INTERESTS
    table:<id>       a private chat for the people at one table

Tables are for students eating alone. Someone "opens a seat" at a hall for a
meal (optionally a time, up to three interests and a short note). Others see
open tables ranked by the interests they share and can join until the table
is full. Joined students get the table's chat. A table disappears after its
meal, and closing or leaving works the way you'd expect.

Safety: sign-in is required everywhere, students appear by username only, user
ids never leave the server, contact details are rejected (see chat_rules),
three reports hide a message, blocks hide a person's messages and tables, and
messages delete themselves after 24 hours.
"""

from __future__ import annotations

from datetime import date as date_cls, datetime, time as time_cls, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import get_current_user
from chat_rules import CONTACT_DETAIL, INTERESTS, MAX_MESSAGE, clean_text, has_contact_details, valid_interests
from database import (
    chat_blocks_collection,
    chat_messages_collection,
    object_id_or_404,
    profile_username,
    tables_collection,
    users_collection,
)
from menu_rules import MT, check_date, today_mt
from menu_store import CLOSED_HALLS, DINING_FILES
from rate_limit import DailyQuota, SlidingWindowLimiter

router = APIRouter(prefix="/api/social", tags=["social"])

HALL_LABELS = {
    "c4c": "C4C", "libby": "Libby", "seec": "SEEC Cafe", "sewall": "Sewall",
    "village_center": "Village Center", "alley": "The Alley",
}
PERIOD_END_HOUR = {"Breakfast": 11, "Lunch": 16, "Dinner": 21}
MESSAGE_TTL = timedelta(hours=24)
TABLE_STAYS_OPEN = timedelta(minutes=90)  # after its start time
REPORTS_TO_HIDE = 3
MAX_HOSTED = 2
MAX_TABLE_INTERESTS = 3
MAX_NOTE = 120

_msg_limiter = SlidingWindowLimiter(limit=20, window_seconds=60, detail="You're sending messages fast. Take a breath.")
_msg_quota = DailyQuota(
    per_key=400, total=50_000, today=today_mt,
    key_detail="That's a lot of messages for one day. Chat resets at midnight.",
    total_detail="Chat is paused for today. Try again tomorrow.",
)
_table_limiter = SlidingWindowLimiter(limit=6, window_seconds=3600, detail="You've opened a lot of tables. Try again later.")

Period = Literal["Breakfast", "Lunch", "Dinner"]


def open_halls() -> list[str]:
    return [h for h in DINING_FILES if h not in CLOSED_HALLS]


def room_catalog() -> list[dict]:
    halls = [{"id": f"hall:{h}", "kind": "hall", "label": HALL_LABELS.get(h, h)} for h in open_halls()]
    interests = [{"id": f"interest:{k}", "kind": "interest", "label": label} for k, label in INTERESTS.items()]
    return halls + interests


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _name(uid: str) -> str:
    name = await profile_username(uid)
    if not name:
        raise HTTPException(status_code=404, detail="Finish setting up your profile first.")
    return name


async def _blocked(uid: str) -> set[str]:
    docs = await chat_blocks_collection.find({"uid": uid}).to_list(1000)
    return {d["blocked_uid"] for d in docs}


async def _blocked_me(uid: str) -> set[str]:
    docs = await chat_blocks_collection.find({"blocked_uid": uid}).to_list(1000)
    return {d["uid"] for d in docs}


async def _active_table(table_id: str) -> dict:
    doc = await tables_collection.find_one({"_id": object_id_or_404(table_id)})
    if not doc or doc["expires_at"].replace(tzinfo=doc["expires_at"].tzinfo or timezone.utc) <= _now():
        raise HTTPException(status_code=404, detail="That table has closed.")
    return doc


async def _room_access(room: str, uid: str) -> None:
    kind, _, key = room.partition(":")
    if kind == "hall" and key in open_halls():
        return
    if kind == "interest" and key in INTERESTS:
        return
    if kind == "table":
        table = await _active_table(key)
        if uid in table["uids"]:
            return
        raise HTTPException(status_code=403, detail="Join the table to see its chat.")
    raise HTTPException(status_code=404, detail="No such room.")


# ── Catalog and interests ───────────────────────────────────────────────────

class CatalogOut(BaseModel):
    interests: list[dict]
    rooms: list[dict]
    halls: list[dict]


@router.get("/catalog", response_model=CatalogOut)
async def catalog() -> CatalogOut:
    return CatalogOut(
        interests=[{"key": k, "label": v} for k, v in INTERESTS.items()],
        rooms=room_catalog(),
        halls=[{"key": h, "label": HALL_LABELS.get(h, h)} for h in open_halls()],
    )


class MeIn(BaseModel):
    interests: list[str] = Field(max_length=len(INTERESTS))


class MeOut(BaseModel):
    interests: list[str]


@router.get("/me", response_model=MeOut)
async def get_me(current_user: dict = Depends(get_current_user)) -> MeOut:
    user = await users_collection.find_one({"firebase_uid": current_user["uid"]}, {"interests": 1})
    if not user:
        raise HTTPException(status_code=404, detail="Finish setting up your profile first.")
    return MeOut(interests=valid_interests(user.get("interests") or []))


@router.put("/me", response_model=MeOut)
async def put_me(body: MeIn, current_user: dict = Depends(get_current_user)) -> MeOut:
    interests = valid_interests(body.interests)
    result = await users_collection.update_one({"firebase_uid": current_user["uid"]}, {"$set": {"interests": interests}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Finish setting up your profile first.")
    return MeOut(interests=interests)


# ── Rooms and messages ──────────────────────────────────────────────────────

class RoomOut(BaseModel):
    id: str
    kind: str
    label: str
    active: int            # people who posted in the last hour
    last_text: str | None
    last_author: str | None
    last_at: datetime | None


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class MessageOut(BaseModel):
    id: str
    room: str
    author: str
    mine: bool
    text: str
    created_at: datetime


def _message_out(doc: dict, uid: str) -> MessageOut:
    return MessageOut(
        id=str(doc["_id"]), room=doc["room"], author=doc["author_name"], mine=doc["author_uid"] == uid,
        text=doc["text"], created_at=doc["created_at"],
    )


@router.get("/rooms", response_model=list[RoomOut])
async def rooms(current_user: dict = Depends(get_current_user)) -> list[RoomOut]:
    blocked = await _blocked(current_user["uid"])
    since = _now() - timedelta(hours=1)
    recent = await chat_messages_collection.find(
        {"created_at": {"$gte": since}, "hidden": {"$ne": True}}
    ).sort([("_id", -1)]).to_list(2000)
    out = []
    for room in room_catalog():
        msgs = [m for m in recent if m["room"] == room["id"] and m["author_uid"] not in blocked]
        last = msgs[0] if msgs else None
        out.append(RoomOut(
            **room,
            active=len({m["author_uid"] for m in msgs}),
            last_text=last["text"][:80] if last else None,
            last_author=last["author_name"] if last else None,
            last_at=last["created_at"] if last else None,
        ))
    return out


@router.get("/rooms/{room}/messages", response_model=list[MessageOut])
async def list_messages(
    room: str,
    after: str | None = Query(None, description="Only messages newer than this message id"),
    current_user: dict = Depends(get_current_user),
) -> list[MessageOut]:
    uid = current_user["uid"]
    await _room_access(room, uid)
    blocked = await _blocked(uid)
    flt: dict = {"room": room, "hidden": {"$ne": True}}
    if after:
        flt["_id"] = {"$gt": object_id_or_404(after)}
        docs = await chat_messages_collection.find(flt).sort([("_id", 1)]).to_list(100)
    else:
        docs = list(reversed(await chat_messages_collection.find(flt).sort([("_id", -1)]).to_list(60)))
    return [_message_out(d, uid) for d in docs if d["author_uid"] not in blocked]


@router.post("/rooms/{room}/messages", response_model=MessageOut, status_code=201)
async def send_message(room: str, body: MessageIn, current_user: dict = Depends(get_current_user)) -> MessageOut:
    uid = current_user["uid"]
    await _room_access(room, uid)
    text = clean_text(body.text)
    if not text:
        raise HTTPException(status_code=422, detail="Say something first.")
    if len(text) > MAX_MESSAGE:
        raise HTTPException(status_code=422, detail=f"Keep it under {MAX_MESSAGE} characters.")
    if has_contact_details(text):
        raise HTTPException(status_code=422, detail=CONTACT_DETAIL)
    name = await _name(uid)
    _msg_limiter.check(uid)
    _msg_quota.take(uid)
    now = _now()
    doc = {
        "room": room, "author_uid": uid, "author_name": name, "text": text,
        "created_at": now, "expires_at": now + MESSAGE_TTL, "reports": [], "hidden": False,
    }
    result = await chat_messages_collection.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _message_out(doc, uid)


async def _others_message(message_id: str, uid: str) -> dict:
    msg = await chat_messages_collection.find_one({"_id": object_id_or_404(message_id)})
    if not msg:
        raise HTTPException(status_code=404, detail="Not found")
    await _room_access(msg["room"], uid)
    if msg["author_uid"] == uid:
        raise HTTPException(status_code=400, detail="That's your own message.")
    return msg


@router.post("/messages/{message_id}/report")
async def report_message(message_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    uid = current_user["uid"]
    msg = await _others_message(message_id, uid)
    await chat_messages_collection.update_one({"_id": msg["_id"]}, {"$addToSet": {"reports": uid}})
    reports = set(msg.get("reports") or []) | {uid}
    hidden = len(reports) >= REPORTS_TO_HIDE
    if hidden:
        await chat_messages_collection.update_one({"_id": msg["_id"]}, {"$set": {"hidden": True}})
    return {"reported": True, "hidden": hidden}


class BlockOut(BaseModel):
    id: str
    name: str


@router.post("/messages/{message_id}/block", response_model=BlockOut)
async def block_author(message_id: str, current_user: dict = Depends(get_current_user)) -> BlockOut:
    uid = current_user["uid"]
    msg = await _others_message(message_id, uid)
    await chat_blocks_collection.update_one(
        {"uid": uid, "blocked_uid": msg["author_uid"]},
        {"$set": {"uid": uid, "blocked_uid": msg["author_uid"], "blocked_name": msg["author_name"], "created_at": _now()}},
        upsert=True,
    )
    doc = await chat_blocks_collection.find_one({"uid": uid, "blocked_uid": msg["author_uid"]})
    return BlockOut(id=str(doc["_id"]), name=doc["blocked_name"])


@router.get("/blocks", response_model=list[BlockOut])
async def list_blocks(current_user: dict = Depends(get_current_user)) -> list[BlockOut]:
    docs = await chat_blocks_collection.find({"uid": current_user["uid"]}).to_list(1000)
    return [BlockOut(id=str(d["_id"]), name=d.get("blocked_name") or "Someone") for d in docs]


@router.delete("/blocks/{block_id}")
async def unblock(block_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    result = await chat_blocks_collection.delete_one({"_id": object_id_or_404(block_id), "uid": current_user["uid"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"unblocked": True}


# ── Tables ──────────────────────────────────────────────────────────────────

class TableIn(BaseModel):
    dining: str
    date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    period: Period
    time: str | None = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$", description="Local HH:MM")
    interests: list[str] = Field(default_factory=list, max_length=MAX_TABLE_INTERESTS)
    note: str = Field("", max_length=400)
    seats: int = Field(4, ge=2, le=6, description="People at the table, including you")


class TableOut(BaseModel):
    id: str
    dining: str
    hall: str
    date: str
    period: str
    time: str | None
    note: str
    interests: list[str]
    shared: list[str]          # interests you have in common with this table
    seats: int
    open_seats: int
    host: str
    members: list[str]
    hosting: bool
    joined: bool
    expires_at: datetime


def _table_out(doc: dict, uid: str, mine: list[str]) -> TableOut:
    interests = doc.get("interests") or []
    return TableOut(
        id=str(doc["_id"]), dining=doc["dining"], hall=HALL_LABELS.get(doc["dining"], doc["dining"]),
        date=doc["date"], period=doc["period"], time=doc.get("time"), note=doc.get("note") or "",
        interests=interests, shared=[i for i in interests if i in mine],
        seats=doc["seats"], open_seats=max(0, doc["seats"] - len(doc["uids"])),
        host=doc["host_name"], members=list(doc["names"]),
        hosting=doc["host_uid"] == uid, joined=uid in doc["uids"], expires_at=doc["expires_at"],
    )


def _closes_at(day: str, period: str, at: str | None) -> datetime:
    d = date_cls.fromisoformat(day)
    if at:
        hh, mm = (int(x) for x in at.split(":"))
        local = datetime.combine(d, time_cls(hh, mm), MT) + TABLE_STAYS_OPEN
    else:
        local = datetime.combine(d, time_cls(PERIOD_END_HOUR[period]), MT)
    return local.astimezone(timezone.utc)


async def _my_interests(uid: str) -> list[str]:
    user = await users_collection.find_one({"firebase_uid": uid}, {"interests": 1})
    return valid_interests((user or {}).get("interests") or [])


@router.get("/tables", response_model=list[TableOut])
async def list_tables(
    dining: str | None = None,
    date: str | None = None,
    current_user: dict = Depends(get_current_user),
) -> list[TableOut]:
    uid = current_user["uid"]
    day = check_date(date, 0, 1, "Tables cover today and tomorrow.")
    flt: dict = {"date": day, "expires_at": {"$gt": _now()}}
    if dining:
        if dining not in open_halls():
            raise HTTPException(status_code=400, detail="Pick an open dining hall.")
        flt["dining"] = dining
    hidden_hosts = await _blocked(uid) | await _blocked_me(uid)
    mine = await _my_interests(uid)
    docs = [d for d in await tables_collection.find(flt).to_list(300) if d["host_uid"] not in hidden_hosts]
    tables = [_table_out(d, uid, mine) for d in docs]
    # Yours first, then tables with room, by interests in common, then soonest.
    tables.sort(key=lambda t: (not (t.hosting or t.joined), t.open_seats == 0, -len(t.shared), t.time or "99:99"))
    return tables


@router.post("/tables", response_model=TableOut, status_code=201)
async def open_table(body: TableIn, current_user: dict = Depends(get_current_user)) -> TableOut:
    uid = current_user["uid"]
    if body.dining not in open_halls():
        raise HTTPException(status_code=400, detail="Pick an open dining hall.")
    day = check_date(body.date, 0, 1, "Tables cover today and tomorrow.")
    note = clean_text(body.note)
    if len(note) > MAX_NOTE:
        raise HTTPException(status_code=422, detail=f"Keep the note under {MAX_NOTE} characters.")
    if has_contact_details(note):
        raise HTTPException(status_code=422, detail=CONTACT_DETAIL)
    closes = _closes_at(day, body.period, body.time)
    now = _now()
    if closes <= now:
        raise HTTPException(status_code=400, detail="That meal time has already passed.")
    name = await _name(uid)
    if await tables_collection.count_documents({"host_uid": uid, "expires_at": {"$gt": now}}) >= MAX_HOSTED:
        raise HTTPException(status_code=429, detail=f"You can host {MAX_HOSTED} tables at a time.")
    _table_limiter.check(uid)
    doc = {
        "host_uid": uid, "host_name": name, "dining": body.dining, "date": day, "period": body.period,
        "time": body.time, "note": note, "interests": valid_interests(body.interests)[:MAX_TABLE_INTERESTS],
        "seats": body.seats, "uids": [uid], "names": [name], "created_at": now, "expires_at": closes,
    }
    result = await tables_collection.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _table_out(doc, uid, await _my_interests(uid))


@router.post("/tables/{table_id}/join", response_model=TableOut)
async def join_table(table_id: str, current_user: dict = Depends(get_current_user)) -> TableOut:
    uid = current_user["uid"]
    table = await _active_table(table_id)
    mine = await _my_interests(uid)
    if uid in table["uids"]:
        return _table_out(table, uid, mine)
    if table["host_uid"] in (await _blocked(uid) | await _blocked_me(uid)):
        raise HTTPException(status_code=404, detail="That table has closed.")
    if len(table["uids"]) >= table["seats"]:
        raise HTTPException(status_code=409, detail="That table is full.")
    name = await _name(uid)
    # Only succeeds if nobody joined or left since we read the table.
    result = await tables_collection.update_one(
        {"_id": table["_id"], "uids": {"$size": len(table["uids"])}},
        {"$push": {"uids": uid, "names": name}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=409, detail="Someone just took that seat. Try again.")
    return _table_out(await _active_table(table_id), uid, mine)


@router.post("/tables/{table_id}/leave")
async def leave_table(table_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    uid = current_user["uid"]
    table = await _active_table(table_id)
    if uid not in table["uids"]:
        raise HTTPException(status_code=400, detail="You're not at this table.")
    if table["host_uid"] == uid:
        await tables_collection.delete_one({"_id": table["_id"]})
        await chat_messages_collection.delete_many({"room": f"table:{table['_id']}"})
        return {"left": True, "closed": True}
    keep = [(u, n) for u, n in zip(table["uids"], table["names"]) if u != uid]
    result = await tables_collection.update_one(
        {"_id": table["_id"], "uids": {"$size": len(table["uids"])}},
        {"$set": {"uids": [u for u, _ in keep], "names": [n for _, n in keep]}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=409, detail="The table just changed. Try again.")
    return {"left": True, "closed": False}
