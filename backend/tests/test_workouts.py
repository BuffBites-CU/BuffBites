from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import energy
from routers import coach, workouts
from tests.fakes import FakeCollection

TODAY = "2026-10-12"


@pytest.fixture
def col(monkeypatch):
    c = FakeCollection()
    monkeypatch.setattr(workouts, "manual_workouts_collection", c)
    monkeypatch.setattr(workouts, "today_mt", lambda: TODAY)
    import menu_rules
    monkeypatch.setattr(menu_rules, "today_mt", lambda: TODAY)
    return c


def _client(uid="u1", signed_in=True) -> TestClient:
    from fastapi import HTTPException
    app = FastAPI()
    app.include_router(workouts.router)

    def user():
        if not signed_in:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return {"uid": uid}
    app.dependency_overrides[workouts.get_current_user] = user
    return TestClient(app)


def _body(**kw):
    return {"sport": "Run", "date": TODAY, "minutes": 30, "distance_km": 5, **kw}


def test_needs_sign_in(col):
    c = _client(signed_in=False)
    assert c.get("/api/workouts").status_code == 401
    assert c.post("/api/workouts", json=_body()).status_code == 401
    assert c.delete("/api/workouts/" + "a" * 24).status_code == 401


def test_add_and_list_roundtrip(col):
    c = _client()
    r = c.post("/api/workouts", json=_body(start_time="07:30", effort="hard"))
    assert r.status_code == 201, r.text
    rec = r.json()
    assert rec["label"] == "Run" and rec["minutes"] == 30 and rec["effort"] == "hard"
    stored = col.docs[0]
    assert stored["firebase_uid"] == "u1" and stored["expires_at"] > stored["created_at"] + timedelta(days=89)
    assert [w["id"] for w in c.get("/api/workouts").json()] == [rec["id"]]


def test_date_defaults_to_today_and_is_limited_to_the_last_week(col):
    c = _client()
    body = _body()
    del body["date"]
    assert c.post("/api/workouts", json=body).json()["date"] == TODAY
    assert c.post("/api/workouts", json=_body(date="2026-10-06")).status_code == 201
    assert c.post("/api/workouts", json=_body(date="2026-10-05")).status_code == 400  # 7 days ago
    assert c.post("/api/workouts", json=_body(date="2026-10-13")).status_code == 400  # the future


@pytest.mark.parametrize("bad", [
    {"sport": "Skydiving"}, {"minutes": 2}, {"minutes": 9999}, {"distance_km": -1},
    {"distance_km": 1000}, {"start_time": "25:00"}, {"effort": "insane"}, {"date": "yesterday"},
])
def test_validation(col, bad):
    assert _client().post("/api/workouts", json=_body(**bad)).status_code == 422
    assert col.docs == []


def test_list_only_shows_my_last_seven_days(col):
    c = _client()
    c.post("/api/workouts", json=_body())
    c.post("/api/workouts", json=_body(date="2026-10-10", minutes=60))
    other = _client("u2")
    other.post("/api/workouts", json=_body(minutes=99))
    col.docs.append({"_id": "old", "firebase_uid": "u1", "sport": "Run", "date": "2026-09-01", "minutes": 30})
    got = c.get("/api/workouts").json()
    assert [(w["date"], w["minutes"]) for w in got] == [(TODAY, 30), ("2026-10-10", 60)]


def test_only_the_owner_can_delete(col):
    mine = _client().post("/api/workouts", json=_body()).json()["id"]
    assert _client("u2").delete(f"/api/workouts/{mine}").status_code == 404
    assert len(col.docs) == 1
    assert _client().delete(f"/api/workouts/{mine}").status_code == 200
    assert col.docs == []
    assert _client().delete("/api/workouts/not-an-id").status_code == 404


def test_daily_and_total_caps(col, monkeypatch):
    monkeypatch.setattr(workouts, "MAX_PER_DAY", 2)
    c = _client()
    assert [c.post("/api/workouts", json=_body()).status_code for _ in range(3)] == [201, 201, 429]
    assert c.post("/api/workouts", json=_body(date="2026-10-11")).status_code == 201
    monkeypatch.setattr(workouts, "MAX_STORED", 3)
    assert c.post("/api/workouts", json=_body(date="2026-10-10")).status_code == 429


# ── Calories ────────────────────────────────────────────────────────────────

def _doc(**kw):
    return {"_id": "abc", "sport": "Run", "date": TODAY, "minutes": 60, "distance_km": 10, "effort": "moderate", **kw}


def test_manual_run_uses_the_same_pace_math_as_strava():
    w = energy.manual_workout(_doc(), 70)
    assert (w.source, w.id, w.method) == ("manual", "abc", "pace")
    assert w.kcal == energy.workout_kcal("Run", 3600, 10_000, 0, None, 70)[0]


def test_effort_scales_sport_mets_only():
    light = energy.manual_workout(_doc(sport="WeightTraining", distance_km=0, effort="light"), 70).kcal
    mid = energy.manual_workout(_doc(sport="WeightTraining", distance_km=0), 70).kcal
    hard = energy.manual_workout(_doc(sport="WeightTraining", distance_km=0, effort="hard"), 70).kcal
    assert light < mid < hard and mid == round(4 * 70)
    # Pace already reflects effort, so the setting doesn't change a run with distance.
    assert energy.manual_workout(_doc(effort="hard"), 70).kcal == energy.manual_workout(_doc(effort="light"), 70).kcal


def test_every_pickable_sport_has_a_calorie_rule():
    for sport in energy.MANUAL_SPORTS:
        assert energy.manual_workout(_doc(sport=sport, distance_km=0), 70).kcal > 0, sport


# ── The coach counts them ───────────────────────────────────────────────────

def test_budget_counts_manual_workouts_without_strava(monkeypatch, col):
    from tests import test_coach as tc
    monkeypatch.setattr(coach, "users_collection", FakeCollection([tc.USER]))
    monkeypatch.setattr(coach.strava_client, "strava_links_collection", FakeCollection())
    c = _client()
    c.post("/api/workouts", json=_body())
    c.post("/api/workouts", json=_body(date="2026-10-10", minutes=45))
    app = FastAPI()
    app.include_router(coach.router)
    app.dependency_overrides[coach.get_current_user] = lambda: {"uid": "u1"}
    b = TestClient(app).get("/api/coach/budget", params={"date": TODAY}).json()
    assert b["training"]["connected"] is False and b["training"]["manual_logged"] == 2
    assert len(b["training"]["today"]) == 1 and b["training"]["today"][0]["source"] == "manual"
    assert b["exercise_kcal"] == b["training"]["today"][0]["kcal"] > 0
    assert b["training"]["week_sessions"] == 2
    assert not any("No workouts counted" in n for n in b["notes"])
