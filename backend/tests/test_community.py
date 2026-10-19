import asyncio
import copy
import importlib.util
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import structlog
from bson import ObjectId
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from pymongo.errors import OperationFailure, ServerSelectionTimeoutError

import database
from routers import comments as comments_router
from routers import community
from tests.fakes import FakeCollection, _project, _Result

NOW = datetime.now(timezone.utc)


def _match(doc: dict, flt: dict) -> bool:
    for key, cond in flt.items():
        value = doc.get(key)
        if isinstance(cond, dict) and cond and all(op.startswith("$") for op in cond):
            for op, arg in cond.items():
                if op == "$ne":
                    ok = arg not in value if isinstance(value, list) else value != arg
                elif op == "$gt":
                    ok = value is not None and value > arg
                else:
                    raise NotImplementedError(op)
                if not ok:
                    return False
        elif isinstance(value, list):
            if cond not in value and value != cond:
                return False
        elif value != cond:
            return False
    return True


def _apply(doc: dict, update: dict) -> None:
    doc.update(copy.deepcopy(update.get("$set", {})))
    for key, n in update.get("$inc", {}).items():
        doc[key] = doc.get(key, 0) + n
    for key, item in update.get("$addToSet", {}).items():
        doc.setdefault(key, [])
        if item not in doc[key]:
            doc[key].append(item)


class _Cursor:
    def __init__(self, docs: list[dict]):
        self.docs = docs

    def sort(self, key: str, direction: int):
        self.docs.sort(key=lambda d: d.get(key), reverse=direction < 0)
        return self

    async def to_list(self, n: int):
        return self.docs[:n]


class MongoFake(FakeCollection):
    """FakeCollection plus the query operators, updates and index calls the community routers use."""

    def __init__(self, docs: list[dict] | None = None, name: str = "fake", indexes: dict | None = None):
        super().__init__(docs)
        self.name = name
        self.indexes = {"_id_": {"key": [("_id", 1)]}, **copy.deepcopy(indexes or {})}
        self.dropped: list[str] = []

    async def find_one(self, flt: dict, projection: dict | None = None):
        for d in self.docs:
            if _match(d, flt):
                return _project(d, projection)
        return None

    def find(self, flt: dict):
        return _Cursor([copy.deepcopy(d) for d in self.docs if _match(d, flt)])

    async def insert_one(self, doc: dict):
        doc.setdefault("_id", ObjectId())  # Motor sets _id on the caller's dict too
        self.docs.append(copy.deepcopy(doc))
        return types.SimpleNamespace(inserted_id=doc["_id"])

    async def update_one(self, flt: dict, update: dict, upsert: bool = False):
        for d in self.docs:
            if _match(d, flt):
                _apply(d, update)
                return _Result(matched=1)
        return _Result()

    async def find_one_and_update(self, flt: dict, update: dict, projection: dict | None = None):
        for d in self.docs:
            if _match(d, flt):
                before = _project(d, projection)
                _apply(d, update)
                return before
        return None

    async def delete_one(self, flt: dict):
        for i, d in enumerate(self.docs):
            if _match(d, flt):
                del self.docs[i]
                return _Result(deleted=1)
        return _Result()

    async def delete_many(self, flt: dict):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not _match(d, flt)]
        return _Result(deleted=before - len(self.docs))

    async def index_information(self):
        return copy.deepcopy(self.indexes)

    async def drop_index(self, name: str):
        del self.indexes[name]
        self.dropped.append(name)

    async def create_index(self, keys, **opts):
        key = [(keys, 1)] if isinstance(keys, str) else list(keys)
        name = "_".join(f"{k}_{d}" for k, d in key)
        info = {"key": key, **opts}
        if name in self.indexes and self.indexes[name] != info:
            raise OperationFailure("Index already exists with different options", code=85)
        self.indexes[name] = info
        return name


def combo(**overrides) -> dict:
    doc = {
        "_id": ObjectId(),
        "title": "Protein Bowl",
        "dining_hall": "c4c",
        "date": "2026-10-12",
        "dishes": [{"name": "Grilled Chicken Breast", "station": "Smoke n' Grill", "servings": 1}],
        "tags": [],
        "description": None,
        "images": [],
        "notes": None,
        "upvotes": 0,
        "downvotes": 0,
        "voters": [],
        "author_username": "alice",
        "author_firebase_uid": "alice-uid",
        "created_at": NOW - timedelta(hours=1),
        "expires_at": NOW + timedelta(hours=23),
    }
    doc.update(overrides)
    return doc


PROFILES = [
    {"firebase_uid": "alice-uid", "username": "alice", "karma": 0},
    {"firebase_uid": "bob-uid", "username": "bob", "karma": 0},
]


def make_env(monkeypatch) -> types.SimpleNamespace:
    """The community and comments routers on fake collections (test_comments uses it too)."""
    combos = MongoFake(name="combos")
    comments = MongoFake(name="comments")
    users = MongoFake(PROFILES, name="users")
    monkeypatch.setattr(database, "users_collection", users)
    monkeypatch.setattr(community, "combos_collection", combos)
    monkeypatch.setattr(community, "comments_collection", comments)
    monkeypatch.setattr(community, "users_collection", users)
    monkeypatch.setattr(comments_router, "combos_collection", combos)
    monkeypatch.setattr(comments_router, "comments_collection", comments)
    app = FastAPI()
    app.include_router(community.router)
    app.include_router(comments_router.router)
    return types.SimpleNamespace(app=app, client=TestClient(app), combos=combos, comments=comments, users=users)


@pytest.fixture
def env(monkeypatch):
    return make_env(monkeypatch)


def sign_in(env, uid: str | None) -> TestClient:
    """Act as `uid` on every route; None is a guest on the optional-auth routes."""
    env.app.dependency_overrides[community.get_current_user] = lambda: {"uid": uid, "name": "Real Google Name"}
    env.app.dependency_overrides[community.get_optional_user] = lambda: uid and {"uid": uid}
    return env.client


# ── has_voted comes from the token, never the query string ───────────────────

@pytest.mark.parametrize("path", ["/api/community/combos", "/api/community/trends", "/api/community/trends/weekly"])
def test_listings_fill_has_voted_from_token(env, path):
    voted = combo(voters=["bob-uid"], upvotes=1)
    other = combo()
    env.combos.docs += [voted, other]

    guest = sign_in(env, None).get(path, params={"firebase_uid": "bob-uid"}).json()
    assert len(guest) == 2
    assert all("has_voted" not in c for c in guest)  # the old query param is ignored
    assert all("voters" not in c for c in guest)

    as_bob = {c["id"]: c["has_voted"] for c in sign_in(env, "bob-uid").get(path).json()}
    assert as_bob == {str(voted["_id"]): True, str(other["_id"]): False}


def test_single_combo_has_voted_from_token(env):
    doc = combo(voters=["bob-uid"])
    env.combos.docs.append(doc)
    url = f"/api/community/combos/{doc['_id']}"
    assert "has_voted" not in sign_in(env, None).get(url).json()
    assert sign_in(env, "bob-uid").get(url).json()["has_voted"] is True
    assert sign_in(env, "alice-uid").get(url).json()["has_voted"] is False


def test_daily_feed_hides_expired_but_weekly_keeps_them(env):
    fresh = combo()
    yesterday = combo(created_at=NOW - timedelta(days=2), expires_at=NOW - timedelta(days=1))
    env.combos.docs += [fresh, yesterday]
    client = sign_in(env, None)
    assert [c["id"] for c in client.get("/api/community/combos").json()] == [str(fresh["_id"])]
    assert [c["id"] for c in client.get("/api/community/trends").json()] == [str(fresh["_id"])]
    weekly = {c["id"] for c in client.get("/api/community/trends/weekly").json()}
    assert weekly == {str(fresh["_id"]), str(yesterday["_id"])}


# ── publishing ───────────────────────────────────────────────────────────────

def publish_body(**overrides) -> dict:
    body = {
        "title": "Protein Bowl",
        "dining_hall": "c4c",
        "date": "2026-10-12",
        "dishes": [{"name": "Grilled Chicken Breast", "station": "Smoke n' Grill", "servings": 1}],
        "tags": ["high-protein"],
        "images": [],
    }
    body.update(overrides)
    return body


def test_publish_takes_author_from_profile_not_query(env):
    r = sign_in(env, "bob-uid").post("/api/community/combos", params={"username": "alice"}, json=publish_body())
    assert r.status_code == 200
    assert r.json()["author_username"] == "bob"
    assert r.json()["author_firebase_uid"] == "bob-uid"
    stored = env.combos.docs[0]
    assert stored["author_username"] == "bob"
    assert stored["expires_at"] - stored["created_at"] == timedelta(hours=24)


def test_publish_without_profile_is_400_and_never_uses_token_name(env):
    r = sign_in(env, "new-uid").post("/api/community/combos", json=publish_body())
    assert r.status_code == 400
    assert env.combos.docs == []


def test_publish_rejects_unknown_hall(env):
    r = sign_in(env, "bob-uid").post("/api/community/combos", json=publish_body(dining_hall="mars"))
    assert r.status_code == 400
    assert env.combos.docs == []


@pytest.mark.parametrize("overrides", [
    {"title": ""},
    {"title": "x" * 121},
    {"notes": "n" * 1001},
    {"description": "d" * 1001},
    {"dishes": []},
    {"dishes": [{"name": "Rice", "station": "Grill", "servings": 1}] * 9},
    {"dishes": [{"name": "Rice", "station": "Grill", "servings": 0}]},
    {"tags": ["t"] * 11},
    {"tags": ["x" * 31]},
    {"images": ["javascript:alert(1)"]},
    {"images": ["http://example.com/a.png"]},
    {"images": ["https://example.com/a.png"] * 5},
    {"date": "next tuesday"},
])
def test_publish_enforces_size_limits(env, overrides):
    r = sign_in(env, "bob-uid").post("/api/community/combos", json=publish_body(**overrides))
    assert r.status_code == 422
    assert env.combos.docs == []


def test_publish_accepts_https_images(env):
    r = sign_in(env, "bob-uid").post(
        "/api/community/combos", json=publish_body(images=["https://example.com/a.png"])
    )
    assert r.status_code == 200
    assert r.json()["images"] == ["https://example.com/a.png"]


def test_update_enforces_size_limits(env):
    doc = combo()
    env.combos.docs.append(doc)
    client = sign_in(env, "alice-uid")
    url = f"/api/community/combos/{doc['_id']}"
    assert client.put(url, json={"notes": "n" * 1001}).status_code == 422
    assert client.put(url, json={"dishes": []}).status_code == 422
    r = client.put(url, json={"title": "Better Bowl"})
    assert r.status_code == 200 and r.json()["title"] == "Better Bowl"


# ── malformed ids ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("method,path", [
    ("GET", "/api/community/combos/not-an-id"),
    ("PUT", "/api/community/combos/not-an-id"),
    ("DELETE", "/api/community/combos/not-an-id"),
    ("POST", "/api/community/combos/not-an-id/vote?vote_type=upvote"),
])
def test_malformed_combo_id_is_404(env, method, path):
    r = sign_in(env, "bob-uid").request(method, path, json={"title": "x"} if method == "PUT" else None)
    assert r.status_code == 404


# ── votes and karma ──────────────────────────────────────────────────────────

def karma(env, uid: str) -> int:
    return next(u for u in env.users.docs if u["firebase_uid"] == uid)["karma"]


def test_upvote_and_downvote_move_author_karma(env):
    doc = combo()
    env.combos.docs.append(doc)
    url = f"/api/community/combos/{doc['_id']}/vote"

    assert sign_in(env, "bob-uid").post(url, params={"vote_type": "upvote"}).status_code == 200
    assert karma(env, "alice-uid") == 1
    assert sign_in(env, "carol-uid").post(url, params={"vote_type": "downvote"}).status_code == 200
    assert karma(env, "alice-uid") == 0

    stored = env.combos.docs[0]
    assert (stored["upvotes"], stored["downvotes"]) == (1, 1)
    assert stored["voters"] == ["bob-uid", "carol-uid"]


def test_repeat_vote_is_409_and_leaves_karma_alone(env):
    doc = combo()
    env.combos.docs.append(doc)
    url = f"/api/community/combos/{doc['_id']}/vote"
    client = sign_in(env, "bob-uid")
    assert client.post(url, params={"vote_type": "upvote"}).status_code == 200
    assert client.post(url, params={"vote_type": "downvote"}).status_code == 409
    assert karma(env, "alice-uid") == 1
    assert env.combos.docs[0]["downvotes"] == 0


def test_self_vote_counts_on_combo_but_not_karma(env):
    doc = combo()
    env.combos.docs.append(doc)
    r = sign_in(env, "alice-uid").post(f"/api/community/combos/{doc['_id']}/vote", params={"vote_type": "upvote"})
    assert r.status_code == 200
    assert env.combos.docs[0]["upvotes"] == 1
    assert karma(env, "alice-uid") == 0


def test_vote_on_missing_combo_is_404(env):
    r = sign_in(env, "bob-uid").post(f"/api/community/combos/{ObjectId()}/vote", params={"vote_type": "upvote"})
    assert r.status_code == 404
    assert karma(env, "alice-uid") == 0


# ── delete cascades to comments ──────────────────────────────────────────────

def test_delete_combo_deletes_its_comments(env):
    doc, keep = combo(), combo()
    env.combos.docs += [doc, keep]
    env.comments.docs += [
        {"_id": ObjectId(), "combo_id": str(doc["_id"]), "text": "a", "author_firebase_uid": "bob-uid"},
        {"_id": ObjectId(), "combo_id": str(doc["_id"]), "text": "b", "author_firebase_uid": "alice-uid"},
        {"_id": ObjectId(), "combo_id": str(keep["_id"]), "text": "c", "author_firebase_uid": "bob-uid"},
    ]
    assert sign_in(env, "bob-uid").delete(f"/api/community/combos/{doc['_id']}").status_code == 403
    assert len(env.comments.docs) == 3

    assert sign_in(env, "alice-uid").delete(f"/api/community/combos/{doc['_id']}").status_code == 200
    assert [c["text"] for c in env.comments.docs] == ["c"]
    assert [c["_id"] for c in env.combos.docs] == [keep["_id"]]


# ── index migration ──────────────────────────────────────────────────────────

LEGACY_COMBO_TTL = {"expires_at_1": {"key": [("expires_at", 1)], "expireAfterSeconds": 0}}


@pytest.fixture
def collections(monkeypatch):
    names = ["users", "combos", "comments", "combo_cache", "strava_links", "coach_plans", "chat_messages", "tables", "chat_blocks"]
    fakes = {n: MongoFake(name=n) for n in names}
    for n, fake in fakes.items():
        monkeypatch.setattr(database, f"{n}_collection", fake)
    return fakes


def test_ensure_indexes_moves_combo_ttl_from_expires_at_to_created_at(collections):
    collections["combos"].indexes.update(copy.deepcopy(LEGACY_COMBO_TTL))

    asyncio.run(database.ensure_indexes())

    combos = collections["combos"]
    assert combos.dropped == ["expires_at_1"]
    assert combos.indexes["expires_at_1"] == {"key": [("expires_at", 1)]}
    assert combos.indexes["created_at_1"] == {"key": [("created_at", 1)], "expireAfterSeconds": 7 * 86400}
    assert collections["comments"].indexes["expires_at_1"]["expireAfterSeconds"] == 0


def test_ensure_indexes_is_idempotent_and_keeps_other_ttls(collections):
    asyncio.run(database.ensure_indexes())
    asyncio.run(database.ensure_indexes())
    assert collections["combos"].dropped == []
    # Only the combos expires_at TTL is migrated; other collections keep theirs.
    assert collections["combo_cache"].indexes["expires_at_1"]["expireAfterSeconds"] == 0
    assert collections["coach_plans"].indexes["expires_at_1"]["expireAfterSeconds"] == 0


def test_ensure_indexes_leaves_a_compound_expires_at_index_alone(collections):
    compound = {"expires_at_1_dining_hall_1": {"key": [("expires_at", 1), ("dining_hall", 1)], "expireAfterSeconds": 0}}
    collections["combos"].indexes.update(copy.deepcopy(compound))
    asyncio.run(database.ensure_indexes())
    assert collections["combos"].dropped == []


def test_ensure_indexes_continues_past_a_failing_index(collections, monkeypatch):
    users = collections["users"]
    real_create = users.create_index

    async def create_index(keys, **opts):
        if keys == "username":
            raise OperationFailure("E11000 duplicate key error", code=11000)
        return await real_create(keys, **opts)

    monkeypatch.setattr(users, "create_index", create_index)
    with structlog.testing.capture_logs() as logs:
        asyncio.run(database.ensure_indexes())

    assert "username_1" not in users.indexes
    assert "firebase_uid_1" in users.indexes
    assert "created_at_1" in collections["combos"].indexes
    assert "firebase_uid_1" in collections["coach_plans"].indexes
    failed = [e for e in logs if e["event"] == "index_create_failed"]
    assert len(failed) == 1 and failed[0]["collection"] == "users"


def test_ensure_indexes_stops_when_mongo_is_unreachable(collections, monkeypatch):
    async def unreachable(*args, **kwargs):
        raise ServerSelectionTimeoutError("no servers")

    monkeypatch.setattr(collections["users"], "create_index", unreachable)
    with pytest.raises(ServerSelectionTimeoutError):
        asyncio.run(database.ensure_indexes())
    assert list(collections["combos"].indexes) == ["_id_"]


# ── optional auth (the real auth module, with Firebase stubbed out) ──────────

@pytest.fixture
def real_auth(monkeypatch):
    import firebase_admin
    from firebase_admin import auth as fb_auth, credentials

    monkeypatch.setenv("FIREBASE_SERVICE_ACCOUNT_JSON", "{}")
    monkeypatch.setattr(credentials, "Certificate", lambda info: object())
    monkeypatch.setattr(firebase_admin, "initialize_app", lambda cred: None)

    def verify_id_token(token):
        if token != "good":
            raise ValueError("bad token")
        return {"uid": "bob-uid"}

    monkeypatch.setattr(fb_auth, "verify_id_token", verify_id_token)
    spec = importlib.util.spec_from_file_location("real_auth", Path(database.__file__).parent / "auth.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_get_optional_user_treats_missing_and_bad_tokens_as_guests(real_auth):
    app = FastAPI()

    @app.get("/who")
    def who(user=Depends(real_auth.get_optional_user)):
        return {"uid": user and user["uid"]}

    client = TestClient(app)
    assert client.get("/who").json() == {"uid": None}
    assert client.get("/who", headers={"Authorization": "Basic abc"}).json() == {"uid": None}
    assert client.get("/who", headers={"Authorization": "Bearer good"}).json() == {"uid": "bob-uid"}
    # An expired or unverifiable token must not break a public read.
    assert client.get("/who", headers={"Authorization": "Bearer forged"}).json() == {"uid": None}


# ── app wiring ───────────────────────────────────────────────────────────────

def test_app_lifespan_healthz_and_no_drafts(monkeypatch):
    import main
    import menu_store

    state = {"indexes": 0, "closed": False, "cancelled": False}

    async def ensure_indexes():
        state["indexes"] += 1

    async def refresh_loop():
        try:
            await asyncio.sleep(3600)
        except asyncio.CancelledError:
            state["cancelled"] = True
            raise

    monkeypatch.setattr(database, "ensure_indexes", ensure_indexes)
    monkeypatch.setattr(database, "client", types.SimpleNamespace(close=lambda: state.update(closed=True)))
    monkeypatch.setattr(menu_store, "refresh_loop", refresh_loop)

    with TestClient(main.app) as client:
        assert client.get("/healthz").json() == {"status": "ok"}
        assert client.get("/api/drafts/u1").status_code == 404
        preflight = client.options(
            "/api/community/combos",
            headers={"Origin": "https://buffbites.vercel.app", "Access-Control-Request-Method": "GET"},
        )
        assert preflight.status_code == 200
        assert "access-control-allow-credentials" not in preflight.headers
        assert state["indexes"] == 1

    assert state == {"indexes": 1, "closed": True, "cancelled": True}
