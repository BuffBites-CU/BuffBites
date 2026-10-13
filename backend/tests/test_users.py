import copy
import re
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pymongo.errors import DuplicateKeyError

from routers import users
from tests.fakes import FakeCollection, _Result, _matches

UNIQUE = ("firebase_uid", "username")


def _elem_matches(elem: dict, cond: dict) -> bool:
    for k, v in cond.items():
        val = elem.get(k)
        if isinstance(v, dict):
            if "$gte" in v and not val >= v["$gte"]:
                return False
            if "$lt" in v and not val < v["$lt"]:
                return False
        elif val != v:
            return False
    return True


class UsersCollection(FakeCollection):
    """FakeCollection plus the bits of Mongo the users router relies on: unique
    indexes on firebase_uid and username, insert_one, $push with $each/$slice,
    and $pull. With `race=True`, username lookups miss, as if another request
    took the name between the router's check and its write."""

    def __init__(self, docs=None, race: bool = False):
        super().__init__(docs)
        self.race = race
        self.updates: list[dict] = []

    async def find_one(self, flt, projection=None):
        if self.race and "username" in flt:
            return None
        cond = flt.get("username")
        if isinstance(cond, dict) and "$regex" in cond:
            flags = re.IGNORECASE if "i" in cond.get("$options", "") else 0
            for d in self.docs:
                if re.match(cond["$regex"], d.get("username", ""), flags):
                    return {k: v for k, v in d.items() if not projection or k in projection or k == "_id"}
            return None
        return await super().find_one(flt, projection)

    def _check_unique(self, doc: dict, skip: dict | None = None) -> None:
        for field in UNIQUE:
            if field in doc and any(d is not skip and d.get(field) == doc[field] for d in self.docs):
                raise DuplicateKeyError("E11000 duplicate key", 11000, {"keyPattern": {field: 1}})

    async def insert_one(self, doc: dict):
        self._check_unique(doc)
        doc["_id"] = f"oid{len(self.docs)}"
        self.docs.append(copy.deepcopy(doc))

    async def update_one(self, flt: dict, update: dict, upsert: bool = False):
        self.updates.append(update)
        for d in self.docs:
            if not _matches(d, flt):
                continue
            changes = update.get("$set", {})
            self._check_unique(changes, skip=d)
            d.update(copy.deepcopy(changes))
            for field, spec in update.get("$push", {}).items():
                arr = d.setdefault(field, []) + copy.deepcopy(spec["$each"])
                d[field] = arr[spec["$slice"]:] if "$slice" in spec else arr
            for field, cond in update.get("$pull", {}).items():
                d[field] = [e for e in d.get(field, []) if not _elem_matches(e, cond)]
            return _Result(matched=1)
        return _Result()


def _user(uid: str, username: str, **extra) -> dict:
    return {
        "_id": f"oid-{uid}", "firebase_uid": uid, "email": f"{uid}@colorado.edu", "username": username,
        "dietary_preferences": [], "restrictions": [], "avatar": None, "karma": 7,
        "created_at": datetime(2026, 9, 1, tzinfo=timezone.utc), "meal_log": [], "favorites": [], **extra,
    }


MEAL = {"title": "Bowl", "calories": 650, "protein_g": 40, "date": "2026-10-12",
        "dining_hall": "c4c", "meal_period": "Lunch"}
FAV = {"title": "Bowl", "dining_hall": "c4c", "date": "2026-10-12", "tags": ["high-protein"],
       "dishes": [{"name": "Rice", "station": "Grill"}, {"name": "Chicken", "station": "Grill"}]}


@pytest.fixture
def col(monkeypatch):
    c = UsersCollection([_user("u1", "ralphie"), _user("u2", "chip")])
    monkeypatch.setattr(users, "users_collection", c)
    return c


def _client(uid: str | None = "u1", email: str = "u1@colorado.edu") -> TestClient:
    app = FastAPI()
    app.include_router(users.router)
    if uid is None:
        def no_token():
            raise HTTPException(status_code=401, detail="Not authenticated")
        app.dependency_overrides[users.get_current_user] = no_token
    else:
        app.dependency_overrides[users.get_current_user] = lambda: {"uid": uid, "email": email}
    return TestClient(app)


def _doc(col: UsersCollection, uid: str) -> dict:
    return next(d for d in col.docs if d["firebase_uid"] == uid)


def test_every_route_but_check_username_needs_a_token(col):
    c = _client(uid=None)
    assert c.get("/api/users/check-username/free_name").json() == {"available": True}
    assert c.get("/api/users/check-username/chip").json() == {"available": False}
    assert c.post("/api/users/", json={"username": "newbie"}).status_code == 401
    assert c.get("/api/users/u1").status_code == 401
    assert c.put("/api/users/u1", json={"username": "x_x_x"}).status_code == 401
    assert c.post("/api/users/u1/meal-log", json=MEAL).status_code == 401
    assert c.delete("/api/users/u1/meal-log", params={"logged_at": "2026-10-12T12:00:00Z"}).status_code == 401
    assert c.post("/api/users/u1/favorites", json=FAV).status_code == 401
    assert c.delete("/api/users/u1/favorites", params={"title": "Bowl", "dining_hall": "c4c", "date": "2026-10-12"}).status_code == 401
    assert col.updates == []


def test_another_users_profile_is_forbidden(col):
    before = copy.deepcopy(_doc(col, "u2"))
    c = _client("u1")
    assert c.get("/api/users/u2").status_code == 403
    assert c.put("/api/users/u2", json={"username": "hijack"}).status_code == 403
    assert c.post("/api/users/u2/meal-log", json=MEAL).status_code == 403
    assert c.delete("/api/users/u2/meal-log", params={"logged_at": "2026-10-12T12:00:00Z"}).status_code == 403
    assert c.post("/api/users/u2/favorites", json=FAV).status_code == 403
    assert c.delete("/api/users/u2/favorites", params={"title": "Bowl", "dining_hall": "c4c", "date": "2026-10-12"}).status_code == 403
    assert _doc(col, "u2") == before


def test_get_returns_own_profile(col):
    r = _client("u1").get("/api/users/u1")
    assert r.status_code == 200
    assert r.json()["username"] == "ralphie"
    assert r.json()["email"] == "u1@colorado.edu"


@pytest.mark.parametrize("field,value", [
    ("karma", 999999), ("firebase_uid", "hijacked"), ("email", "x@y.z"),
    ("meal_log", []), ("favorites", []), ("body", {"weight_kg": "x"}), ("$where", 1),
])
def test_put_rejects_fields_outside_the_whitelist(col, field, value):
    before = copy.deepcopy(_doc(col, "u1"))
    r = _client("u1").put("/api/users/u1", json={"dietary_preferences": ["vegan"], field: value})
    assert r.status_code == 422
    assert _doc(col, "u1") == before


def test_put_sets_only_the_fields_sent_including_nulls(col):
    _doc(col, "u1").update(preferred_calories_per_meal=700, default_dining_hall="c4c")
    r = _client("u1").put("/api/users/u1", json={
        "username": "ralphie_2", "dietary_preferences": ["vegan"],
        "preferred_calories_per_meal": None, "default_dining_hall": None,
        "nutrition_goals": {"protein_g_per_meal": 35, "priority_nutrients": ["iron"]},
    })
    assert r.status_code == 200
    assert col.updates[-1] == {"$set": {
        "username": "ralphie_2", "dietary_preferences": ["vegan"],
        "preferred_calories_per_meal": None, "default_dining_hall": None,
        "nutrition_goals": {"protein_g_per_meal": 35, "priority_nutrients": ["iron"]},
    }}
    doc = _doc(col, "u1")
    assert doc["karma"] == 7 and doc["email"] == "u1@colorado.edu"


def test_put_with_nothing_to_change(col):
    assert _client("u1").put("/api/users/u1", json={}).status_code == 200
    assert col.updates == []
    assert _client("u3").put("/api/users/u3", json={}).status_code == 404


@pytest.mark.parametrize("body", [
    {"username": "ab"}, {"username": "x" * 21}, {"username": "has space"}, {"username": "<script>"},
    {"username": "trailing\n"}, {"username": None}, {"dietary_preferences": None},
    {"preferred_calories_per_meal": -1}, {"dietary_preferences": ["x"] * 11},
])
def test_put_validates_values(col, body):
    assert _client("u1").put("/api/users/u1", json=body).status_code == 422
    assert col.updates == []


def test_put_duplicate_username_is_400(col):
    r = _client("u1").put("/api/users/u1", json={"username": "chip"})
    assert r.status_code == 400
    assert r.json() == {"detail": "Username already taken"}
    assert _doc(col, "u1")["username"] == "ralphie"
    # Re-saving your own current name is not a clash.
    assert _client("u1").put("/api/users/u1", json={"username": "ralphie"}).status_code == 200


def test_put_duplicate_username_race_is_400(col):
    col.race = True
    r = _client("u1").put("/api/users/u1", json={"username": "chip"})
    assert r.status_code == 400
    assert r.json() == {"detail": "Username already taken"}


def test_create_takes_uid_and_email_from_the_token(col):
    r = _client("u3", email="real@colorado.edu").post("/api/users/", json={
        "firebase_uid": "someoneElse", "email": "spoof@evil.test",
        "username": "newbie", "dietary_preferences": ["vegan"],
    })
    assert r.status_code == 200
    assert r.json()["firebase_uid"] == "u3"
    assert r.json()["email"] == "real@colorado.edu"
    assert r.json()["karma"] == 0
    doc = _doc(col, "u3")
    assert doc["email"] == "real@colorado.edu" and doc["username"] == "newbie"
    assert not any(d["firebase_uid"] == "someoneElse" for d in col.docs)


def test_create_rejects_a_bad_username(col):
    for name in ("ab", "<script>", "x" * 21, "white space"):
        assert _client("u3").post("/api/users/", json={"username": name}).status_code == 422
    assert len(col.docs) == 2


def test_create_duplicates(col):
    r = _client("u1").post("/api/users/", json={"username": "brand_new"})
    assert r.status_code == 400 and r.json()["detail"] == "User already exists"
    r = _client("u3").post("/api/users/", json={"username": "chip"})
    assert r.status_code == 400 and r.json()["detail"] == "Username already taken"
    col.race = True
    r = _client("u3").post("/api/users/", json={"username": "chip"})
    assert r.status_code == 400 and r.json()["detail"] == "Username already taken"
    assert len(col.docs) == 2


def test_meal_log_keeps_the_newest_entries(col):
    old = [{**MEAL, "title": f"meal {i}", "logged_at": datetime(2025, 1, 1, tzinfo=timezone.utc)}
           for i in range(users.MEAL_LOG_CAP)]
    _doc(col, "u1")["meal_log"] = old
    r = _client("u1").post("/api/users/u1/meal-log", json={**MEAL, "title": "newest"})
    assert r.status_code == 200
    assert col.updates[-1]["$push"]["meal_log"]["$slice"] == -users.MEAL_LOG_CAP
    log = _doc(col, "u1")["meal_log"]
    assert len(log) == users.MEAL_LOG_CAP
    assert log[0]["title"] == "meal 1" and log[-1]["title"] == "newest"


def test_favorites_are_capped(col):
    assert _client("u1").post("/api/users/u1/favorites", json=FAV).status_code == 200
    assert col.updates[-1]["$push"]["favorites"]["$slice"] == -users.FAVORITES_CAP
    assert _doc(col, "u1")["favorites"][0]["dishes"] == FAV["dishes"]


@pytest.mark.parametrize("patch", [
    {"calories": -5}, {"calories": 10001}, {"protein_g": -1}, {"carbs_g": 1001},
    {"date": "tomorrow"}, {"title": "x" * 201}, {"meal_period": "x" * 21},
])
def test_meal_log_entries_are_validated(col, patch):
    assert _client("u1").post("/api/users/u1/meal-log", json={**MEAL, **patch}).status_code == 422
    assert col.updates == []


@pytest.mark.parametrize("patch", [
    {"dishes": [{"name": "Rice", "station": "Grill"}] * 9}, {"dishes": [{"anything": "goes"}]},
    {"approximate_calories": -1}, {"date": "2026/10/12"}, {"tags": ["x"] * 21},
])
def test_favorites_are_validated(col, patch):
    assert _client("u1").post("/api/users/u1/favorites", json={**FAV, **patch}).status_code == 422
    assert col.updates == []


def test_owner_can_remove_meals_and_favorites(col):
    c = _client("u1")
    c.post("/api/users/u1/meal-log", json={**MEAL, "logged_at": "2026-10-12T18:30:00.123Z"})
    c.post("/api/users/u1/favorites", json=FAV)
    assert c.delete("/api/users/u1/meal-log", params={"logged_at": "2026-10-12T18:30:00Z"}).status_code == 200
    assert c.delete("/api/users/u1/favorites", params={"title": "Bowl", "dining_hall": "c4c", "date": "2026-10-12"}).status_code == 200
    assert _doc(col, "u1")["meal_log"] == [] and _doc(col, "u1")["favorites"] == []


def test_get_user_tolerates_entries_stored_before_validation(monkeypatch):
    """Rows written before the limits existed must not lock the owner out."""
    legacy = {
        "_id": "legacy-id", "firebase_uid": "u1", "email": "a@b.c", "username": "old_name", "dietary_preferences": [],
        "restrictions": [], "avatar": None, "karma": 0, "created_at": datetime.now(timezone.utc),
        "nutrition_goals": {"protein_g_per_meal": 5000, "dietary_focus": "x" * 80, "priority_nutrients": []},
        "meal_log": [{"title": "t" * 300, "calories": -5, "date": "Oct 9", "dining_hall": "c4c",
                      "meal_period": "Lunch", "logged_at": datetime.now(timezone.utc)}],
        "favorites": [{"title": "f", "dining_hall": "c4c", "date": "2026-10-09", "tags": [],
                       "dishes": [{"name": "a", "station": "b", "servings": 1}] * 12, "saved_at": datetime.now(timezone.utc)}],
    }
    monkeypatch.setattr(users, "users_collection", FakeCollection([legacy]))
    r = _client("u1").get("/api/users/u1")
    assert r.status_code == 200, r.text
    assert r.json()["meal_log"][0]["calories"] == -5


def test_usernames_are_unique_regardless_of_case(col):
    assert _client("u2").get("/api/users/check-username/RALPHIE").json() == {"available": False}
    r = _client("u2").put("/api/users/u2", json={"username": "Ralphie"})
    assert r.status_code == 400 and r.json()["detail"] == "Username already taken"
    # Changing the case of your own name is fine.
    assert _client("u1").put("/api/users/u1", json={"username": "Ralphie"}).status_code == 200
