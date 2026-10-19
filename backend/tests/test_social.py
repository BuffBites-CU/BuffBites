from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

import chat_rules
import database
import menu_rules
from routers import social
from tests.fakes import FakeCollection

TODAY = "2026-10-19"
NOON = datetime(2026, 10, 19, 18, 0, tzinfo=timezone.utc)  # 12:00 in Boulder


@pytest.fixture
def env(monkeypatch):
    users = FakeCollection([
        {"firebase_uid": "a", "username": "ralphie", "interests": ["gaming", "cs", "outdoors"]},
        {"firebase_uid": "b", "username": "chip", "interests": ["gaming", "music"]},
        {"firebase_uid": "c", "username": "buffy", "interests": ["premed"]},
        {"firebase_uid": "d", "username": "folsom", "interests": []},
    ])
    cols = {"msgs": FakeCollection(), "tables": FakeCollection(), "blocks": FakeCollection(), "users": users}
    monkeypatch.setattr(social, "users_collection", users)
    monkeypatch.setattr(database, "users_collection", users)
    monkeypatch.setattr(social, "chat_messages_collection", cols["msgs"])
    monkeypatch.setattr(social, "tables_collection", cols["tables"])
    monkeypatch.setattr(social, "chat_blocks_collection", cols["blocks"])
    monkeypatch.setattr(social, "_now", lambda: NOON)
    monkeypatch.setattr(menu_rules, "today_mt", lambda: TODAY)
    for lim in (social._msg_limiter, social._table_limiter):
        lim._hits.clear()
    social._msg_quota.day = ""
    return cols


def client(uid: str | None) -> TestClient:
    app = FastAPI()
    app.include_router(social.router)

    def user():
        if uid is None:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return {"uid": uid}
    app.dependency_overrides[social.get_current_user] = user
    return TestClient(app)


A, B, C, D = client("a"), client("b"), client("c"), client("d")


def say(c: TestClient, room: str, text: str):
    return c.post(f"/api/social/rooms/{room}/messages", json={"text": text})


# ── Catalog and interests ───────────────────────────────────────────────────

def test_catalog_lists_open_halls_and_interests(env):
    cat = client(None).get("/api/social/catalog").json()
    ids = [r["id"] for r in cat["rooms"]]
    assert "hall:c4c" in ids and "hall:alley" not in ids  # the Alley is closed
    assert "interest:gaming" in ids and len(cat["interests"]) == len(chat_rules.INTERESTS)


def test_interests_round_trip_and_are_cleaned(env):
    r = D.put("/api/social/me", json={"interests": ["gaming", "bogus", "gaming", "music", "art", "film", "cs", "chill"]})
    assert r.json()["interests"] == ["gaming", "music", "art", "film", "cs"]
    assert D.get("/api/social/me").json()["interests"] == ["gaming", "music", "art", "film", "cs"]


def test_everything_but_the_catalog_needs_sign_in(env):
    anon = client(None)
    for method, url in [("get", "/api/social/me"), ("get", "/api/social/rooms"), ("get", "/api/social/tables"),
                        ("get", "/api/social/rooms/hall:c4c/messages"), ("post", "/api/social/tables")]:
        assert getattr(anon, method)(url).status_code == 401, url


# ── Rooms ───────────────────────────────────────────────────────────────────

def test_send_and_read_messages_with_cursor(env):
    first = say(A, "hall:c4c", "anyone at c4c for lunch?").json()
    assert first["mine"] is True and first["author"] == "ralphie"
    say(B, "hall:c4c", "yep, by the pizza")
    msgs = B.get("/api/social/rooms/hall:c4c/messages").json()
    assert [m["text"] for m in msgs] == ["anyone at c4c for lunch?", "yep, by the pizza"]
    assert [m["mine"] for m in msgs] == [False, True]
    newer = B.get("/api/social/rooms/hall:c4c/messages", params={"after": first["id"]}).json()
    assert [m["text"] for m in newer] == ["yep, by the pizza"]
    assert "author_uid" not in msgs[0] and "uid" not in str(msgs)  # ids never leave the server


@pytest.mark.parametrize("room", ["hall:alley", "hall:nowhere", "interest:skydiving", "lobby"])
def test_unknown_or_closed_rooms_are_404(env, room):
    assert say(A, room, "hi").status_code == 404


@pytest.mark.parametrize("text", [
    "text me 303-555-0199", "my insta: @ralph.ie", "add me on snap: ralphie", "mail ralph@colorado.edu",
    "join https://discord.gg/abc", "see buffbites.app",
])
def test_contact_details_are_rejected(env, text):
    r = say(A, "interest:gaming", text)
    assert r.status_code == 422 and "in person" in r.json()["detail"]
    assert env["msgs"].docs == []


def test_message_length_and_blank_messages(env):
    assert say(A, "hall:c4c", "x" * 281).status_code == 422
    assert say(A, "hall:c4c", "   ​  ").status_code == 422


def test_rooms_summary_counts_recent_people(env):
    say(A, "hall:libby", "hi")
    say(B, "hall:libby", "hey")
    say(A, "hall:libby", "what's good today")
    rooms = {r["id"]: r for r in A.get("/api/social/rooms").json()}
    assert rooms["hall:libby"]["active"] == 2 and rooms["hall:libby"]["last_text"] == "what's good today"
    assert rooms["hall:c4c"]["active"] == 0 and rooms["hall:c4c"]["last_text"] is None


def test_three_reports_hide_a_message(env):
    mid = say(A, "hall:c4c", "something rude").json()["id"]
    assert A.post(f"/api/social/messages/{mid}/report").status_code == 400  # not your own
    assert B.post(f"/api/social/messages/{mid}/report").json()["hidden"] is False
    assert B.post(f"/api/social/messages/{mid}/report").json()["hidden"] is False  # same reporter twice
    C.post(f"/api/social/messages/{mid}/report")
    assert D.post(f"/api/social/messages/{mid}/report").json()["hidden"] is True
    assert C.get("/api/social/rooms/hall:c4c/messages").json() == []


def test_blocking_hides_messages_and_can_be_undone(env):
    mid = say(A, "hall:c4c", "hey").json()["id"]
    blk = B.post(f"/api/social/messages/{mid}/block").json()
    assert blk["name"] == "ralphie"
    assert B.get("/api/social/rooms/hall:c4c/messages").json() == []
    assert len(C.get("/api/social/rooms/hall:c4c/messages").json()) == 1  # only for the blocker
    assert [b["name"] for b in B.get("/api/social/blocks").json()] == ["ralphie"]
    assert B.delete(f"/api/social/blocks/{blk['id']}").status_code == 200
    assert len(B.get("/api/social/rooms/hall:c4c/messages").json()) == 1


def test_message_burst_is_limited(env, monkeypatch):
    monkeypatch.setattr(social._msg_limiter, "limit", 2)
    assert [say(A, "hall:c4c", f"m{i}").status_code for i in range(3)] == [201, 201, 429]


# ── Tables ──────────────────────────────────────────────────────────────────

def open_table(c=A, **kw):
    body = {"dining": "c4c", "period": "Lunch", "time": "12:30", "interests": ["gaming", "cs"], "note": "Window seats", "seats": 3, **kw}
    return c.post("/api/social/tables", json=body)


def test_open_join_and_chat(env):
    t = open_table().json()
    assert t["hosting"] and t["open_seats"] == 2 and t["members"] == ["ralphie"]
    tid = t["id"]
    # Not at the table yet: no chat.
    assert B.get(f"/api/social/rooms/table:{tid}/messages").status_code == 403
    j = B.post(f"/api/social/tables/{tid}/join").json()
    assert j["joined"] and j["members"] == ["ralphie", "chip"] and j["open_seats"] == 1
    assert say(B, f"table:{tid}", "omw, grey hoodie").status_code == 201
    assert [m["text"] for m in A.get(f"/api/social/rooms/table:{tid}/messages").json()] == ["omw, grey hoodie"]
    assert B.post(f"/api/social/tables/{tid}/join").json()["members"] == ["ralphie", "chip"]  # idempotent


def test_full_tables_refuse_joins(env):
    tid = open_table(seats=2).json()["id"]
    B.post(f"/api/social/tables/{tid}/join")
    r = C.post(f"/api/social/tables/{tid}/join")
    assert r.status_code == 409 and "full" in r.json()["detail"]


def test_list_ranks_by_shared_interests(env):
    open_table(c=C, interests=["premed"], time="12:00")
    open_table(c=A, interests=["gaming", "cs"], time="13:00")
    tables = B.get("/api/social/tables", params={"dining": "c4c"}).json()
    assert [t["host"] for t in tables] == ["ralphie", "buffy"]  # chip shares gaming with ralphie
    assert tables[0]["shared"] == ["gaming"] and tables[1]["shared"] == []


def test_leaving_and_closing(env):
    tid = open_table().json()["id"]
    B.post(f"/api/social/tables/{tid}/join")
    say(B, f"table:{tid}", "see you there")
    assert B.post(f"/api/social/tables/{tid}/leave").json() == {"left": True, "closed": False}
    assert A.get("/api/social/tables").json()[0]["members"] == ["ralphie"]
    assert A.post(f"/api/social/tables/{tid}/leave").json()["closed"] is True
    assert A.get("/api/social/tables").json() == []
    assert env["msgs"].docs == []  # the table's chat goes with it


def test_table_rules(env):
    assert open_table(dining="alley").status_code == 400
    assert open_table(time="09:00").status_code == 400  # 09:00 + 90 min is before noon: already passed
    assert open_table(note="text me 3035550199").status_code == 422
    assert open_table(date="2026-10-21").status_code == 400  # more than a day ahead
    assert open_table(seats=9).status_code == 422
    open_table(time="13:00")
    open_table(period="Dinner", time="18:00")
    r = open_table(period="Dinner", time="19:00")
    assert r.status_code == 429  # two hosted tables at a time


def test_tables_close_after_their_meal(env, monkeypatch):
    tid = open_table(time="12:30").json()["id"]
    monkeypatch.setattr(social, "_now", lambda: NOON + timedelta(hours=3))
    assert A.get("/api/social/tables").json() == []
    assert B.post(f"/api/social/tables/{tid}/join").status_code == 404


def test_blocked_hosts_tables_are_hidden(env):
    mid = say(A, "hall:c4c", "hey").json()["id"]
    tid = open_table().json()["id"]
    B.post(f"/api/social/messages/{mid}/block")
    assert B.get("/api/social/tables").json() == []
    assert B.post(f"/api/social/tables/{tid}/join").status_code == 404
