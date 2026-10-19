import asyncio
import json
from datetime import datetime

import anthropic
import httpx2
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import menu_rules
import menu_store
import strava_client
from routers import coach
from routers.coach import DietRules, PlanChecker, Targets, _CoachMeal, _DraftItem, _DraftMeal, build_menu, plan_targets
from tests.fakes import FakeCollection

TODAY = "2026-10-12"

DAY = {
    "date": TODAY,
    "day_of_week": "Monday",
    "categories": {
        "Omelet Bar": [
            {"name": "Cage Free Eggs", "serving_size": "4 oz", "calories": 170, "is_vegetarian": True,
             "allergens": ["Egg"], "nutrition": {"protein_g": 16, "carbohydrates_g": 1, "fat_g": 11}},
        ],
        "Smoke n' Grill": [
            {"name": "Grilled Chicken Breast", "serving_size": "4 oz", "calories": 180,
             "nutrition": {"protein_g": 32, "carbohydrates_g": 0, "fat_g": 5}},
            {"name": "Pork Carnitas", "serving_size": "4 oz", "calories": 250,
             "nutrition": {"protein_g": 24, "carbohydrates_g": 2, "fat_g": 15}},
        ],
        "Wholesome Field": [
            {"name": "Brown Rice", "serving_size": "1/2 cup", "calories": 110, "is_vegan": True,
             "nutrition": {"protein_g": 2.5, "carbohydrates_g": 23, "fat_g": 1}},
            {"name": "Peanut Noodles", "serving_size": "1 cup", "calories": 400, "is_vegan": True,
             "allergens": ["Peanuts", "Wheat"], "nutrition": {"protein_g": 12, "carbohydrates_g": 50, "fat_g": 16}},
        ],
    },
}

USER = {
    "firebase_uid": "u1",
    "body": {"weight_kg": 70, "height_cm": 175, "age": 20, "sex": "male"},
    "nutrition_goals": {"dietary_focus": "endurance"},
    "dietary_preferences": [],
    "restrictions": ["peanut"],
    "meal_log": [],
}


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setitem(menu_store._cache, "c4c", {"dining_location": "C4C", "menus": [DAY]})
    monkeypatch.setattr(menu_rules, "today_mt", lambda: TODAY)
    monkeypatch.setattr(coach, "_now_mt", lambda: datetime.fromisoformat(f"{TODAY}T08:00:00-06:00"))
    monkeypatch.setattr(coach, "users_collection", FakeCollection([USER]))
    monkeypatch.setattr(coach, "coach_plans_collection", FakeCollection())
    monkeypatch.setattr(strava_client, "strava_links_collection", FakeCollection())
    coach._limiter._hits.clear()
    coach._quota.day = ""


def _app(uid: str = "u1") -> TestClient:
    app = FastAPI()
    app.include_router(coach.router)
    app.dependency_overrides[coach.get_current_user] = lambda: {"uid": uid}
    return TestClient(app)


def _checker(prefs=(), avoid=("peanut",), by_period=None, kcal=900, protein=60):
    _, lookup = build_menu(DAY)
    by_period = by_period or {"Lunch": (400, 30), "Dinner": (500, 30)}
    return PlanChecker(lookup, DietRules(set(prefs), list(avoid)), Targets(by_period, kcal, protein))


# ── Menu, rules and the check_plan tool ────────────────────────────────────

def test_build_menu_groups_by_station_with_tags_and_flags():
    text, lookup = build_menu(DAY)
    assert "## Omelet Bar [breakfast]" in text
    assert "Brown Rice | 1/2 cup | 110 kcal | P2.5 C23 F1 | vegan" in text
    assert "Peanut Noodles" in text and "vegan, gluten" in text
    assert lookup["grilled chicken breast"]["protein"] == 32


def test_check_plan_totals_from_menu_and_passes_on_target():
    c = _checker()
    r = c.check([
        _DraftMeal(period="Lunch", items=[_DraftItem(name="Grilled Chicken Breast", servings=1), _DraftItem(name="Brown Rice", servings=2)]),
        _DraftMeal(period="Dinner", items=[_DraftItem(name="grilled chicken  breast", servings=1.5), _DraftItem(name="Brown Rice", servings=2)]),
    ])
    assert r["day"]["kcal"] == 180 + 220 + 270 + 220
    assert r["day"]["protein_g"] == round(32 + 5 + 48 + 5)
    assert r["ok"] is True, r["issues"]


def test_check_plan_flags_off_menu_rule_breaks_missing_meals_and_gaps():
    c = _checker(prefs={"halal"})
    r = c.check([_DraftMeal(period="Lunch", items=[
        _DraftItem(name="Grilled Chiken Breast", servings=1),
        _DraftItem(name="Pork Carnitas", servings=1),
        _DraftItem(name="Peanut Noodles", servings=1),
    ])])
    issues = " ".join(r["issues"])
    assert r["ok"] is False
    assert "Did you mean: Grilled Chicken Breast" in issues
    assert "Pork Carnitas" in issues and "halal" in issues
    assert "Peanut Noodles" in issues and "peanut" in issues
    assert "Dinner is missing" in issues
    assert "add about" in issues


def test_servings_are_clamped_and_rounded():
    c = _checker()
    r = c.check([_DraftMeal(period="Lunch", items=[_DraftItem(name="Brown Rice", servings=40)]),
                 _DraftMeal(period="Dinner", items=[_DraftItem(name="Brown Rice", servings=0.1)])])
    assert [m["items"][0]["servings"] for m in r["meals"]] == [3.0, 0.5]


def test_ground_drops_unverifiable_items_and_unneeded_meals():
    c = _checker()
    meals = c.ground([
        _CoachMeal(period="Breakfast", title="x", why="", items=[_DraftItem(name="Cage Free Eggs", servings=1)]),
        _CoachMeal(period="Dinner", title="Recovery bowl", why="Carbs after the run.", items=[
            _DraftItem(name="Brown Rice", servings=2), _DraftItem(name="Lobster", servings=1), _DraftItem(name="Peanut Noodles", servings=1)]),
        _CoachMeal(period="Lunch", title="Chicken plate", why="Protein.", items=[_DraftItem(name="Grilled Chicken Breast", servings=1)]),
    ])
    assert [m.period for m in meals] == ["Lunch", "Dinner"]  # breakfast isn't planned; sorted by time
    assert [i.name for i in meals[1].items] == ["Brown Rice"]
    assert meals[1].totals.calories == 220


def test_item_limit_is_six_in_check_and_ground():
    c = _checker()
    seven = [_DraftItem(name="Brown Rice", servings=0.5)] * 7
    r = c.check([_DraftMeal(period="Lunch", items=seven),
                 _DraftMeal(period="Dinner", items=[_DraftItem(name="Grilled Chicken Breast", servings=1)])])
    assert r["ok"] is False and any("keep it to 6 or fewer" in i for i in r["issues"])
    meals = c.ground([_CoachMeal(period="Lunch", title="x", why="", items=seven)])
    assert len(meals[0].items) == 6


# ── Splitting the day ──────────────────────────────────────────────────────

def _budget(target=2400, protein=100, eaten_kcal=0, eaten_protein=0):
    return coach.BudgetOut(
        date=TODAY, bmr=1700, baseline_kcal=2380, exercise_kcal=0, goal_adjust_kcal=0, target_kcal=target,
        protein_g=protein, carbs_g=300, fat_g=80, fiber_g=34, training_load="rest", focus=None,
        eaten=coach.Macros(calories=eaten_kcal, protein_g=eaten_protein), remaining_kcal=target - eaten_kcal,
        body=coach.BodyOut(weight_kg=70, height_cm=175, age=20, sex="male", estimated=[]),
        training=coach.TrainingOut(connected=False), notes=[],
    )


def test_morning_plans_all_three_meals_by_share():
    t, notes = plan_targets(_budget(), set(), TODAY, datetime.fromisoformat(f"{TODAY}T08:00:00"))
    assert t.by_period == {"Breakfast": (600, 25), "Lunch": (840, 35), "Dinner": (960, 40)}
    assert notes == []


def test_unlogged_past_meals_count_at_their_usual_share():
    t, notes = plan_targets(_budget(), set(), TODAY, datetime.fromisoformat(f"{TODAY}T17:00:00"))
    assert list(t.by_period) == ["Dinner"]
    assert t.kcal == 2400 - round(0.6 * 2400)
    assert len(notes) == 2


def test_logged_meals_use_logged_values():
    t, _ = plan_targets(_budget(eaten_kcal=1500, eaten_protein=70), {"Breakfast", "Lunch"}, TODAY,
                        datetime.fromisoformat(f"{TODAY}T12:00:00"))
    assert t.by_period == {"Dinner": (900, 30)}


def test_nothing_left_to_plan():
    t, _ = plan_targets(_budget(), set(), TODAY, datetime.fromisoformat(f"{TODAY}T22:00:00"))
    assert t.by_period == {}
    t, _ = plan_targets(_budget(eaten_kcal=2350), {"Breakfast"}, TODAY, datetime.fromisoformat(f"{TODAY}T09:00:00"))
    assert t.by_period == {}


def test_tomorrow_ignores_the_clock():
    t, _ = plan_targets(_budget(), set(), "2026-10-13", datetime.fromisoformat(f"{TODAY}T22:00:00"))
    assert list(t.by_period) == ["Breakfast", "Lunch", "Dinner"]


# ── Endpoints ──────────────────────────────────────────────────────────────

def test_budget_without_strava_is_a_rest_day_with_a_nudge():
    r = _app().get("/api/coach/budget")
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["training"]["connected"] is False and b["exercise_kcal"] == 0
    assert any("rest-day estimate" in n for n in b["notes"])


def test_budget_counts_todays_strava_workouts(monkeypatch):
    monkeypatch.setattr(strava_client, "strava_links_collection", FakeCollection([{"firebase_uid": "u1", "weight_kg": 80}]))
    monkeypatch.setattr(strava_client, "configured", lambda: True)

    async def acts(uid):
        return [
            {"sport_type": "Run", "start_date_local": f"{TODAY}T07:00:00Z", "moving_time": 3600, "distance": 10000},
            {"sport_type": "Ride", "start_date_local": "2026-10-10T07:00:00Z", "moving_time": 3600, "kilojoules": 700},
        ]
    monkeypatch.setattr(strava_client, "recent_activities", acts)
    b = _app().get("/api/coach/budget").json()
    assert b["training"]["connected"] is True
    assert len(b["training"]["today"]) == 1 and b["exercise_kcal"] == b["training"]["today"][0]["kcal"] > 0
    assert b["training"]["week_sessions"] == 2
    assert b["body"]["weight_kg"] == 70  # the student's own stats beat Strava's


def test_budget_survives_a_strava_outage(monkeypatch):
    monkeypatch.setattr(strava_client, "strava_links_collection", FakeCollection([{"firebase_uid": "u1"}]))
    monkeypatch.setattr(strava_client, "configured", lambda: True)

    async def down(uid):
        raise strava_client.StravaUnavailable("503")
    monkeypatch.setattr(strava_client, "recent_activities", down)
    b = _app().get("/api/coach/budget").json()
    assert b["training"]["connected"] is True and b["training"]["error"]


def test_budget_rejects_far_dates_and_unknown_users():
    assert _app().get("/api/coach/budget", params={"date": "2026-10-20"}).status_code == 400
    assert _app("nobody").get("/api/coach/budget").status_code == 404


def test_body_stats_round_trip_and_validation():
    c = _app()
    assert c.put("/api/coach/body", json={"weight_kg": 10}).status_code == 422
    assert c.put("/api/coach/body", json={"weight_kg": 64.5, "height_cm": 168, "age": 21, "sex": "female"}).status_code == 200
    assert c.get("/api/coach/body").json() == {"weight_kg": 64.5, "height_cm": 168, "age": 21, "sex": "female"}


def _good_output():
    return coach._CoachOutput(headline="Fuel the long run.", tips=["Drink water."], meals=[
        _CoachMeal(period="Breakfast", title="Eggs", why="Protein to start.", items=[_DraftItem(name="Cage Free Eggs", servings=2)]),
        _CoachMeal(period="Lunch", title="Chicken rice", why="Carbs.", items=[_DraftItem(name="Grilled Chicken Breast", servings=1), _DraftItem(name="Brown Rice", servings=2)]),
        _CoachMeal(period="Dinner", title="Bowl", why="Recovery.", items=[_DraftItem(name="Grilled Chicken Breast", servings=2), _DraftItem(name="Brown Rice", servings=3)]),
    ])


def test_plan_endpoint_grounds_and_caches(monkeypatch):
    calls = []

    async def fake_agent(brief, menu_text, hall, checker):
        calls.append(brief)
        return _good_output()
    monkeypatch.setattr(coach, "_run_agent", fake_agent)
    c = _app()
    r = c.post("/api/coach/plan", json={"dining": "c4c"})
    assert r.status_code == 200, r.text
    p = r.json()
    assert [m["period"] for m in p["meals"]] == ["Breakfast", "Lunch", "Dinner"]
    assert p["meals"][0]["totals"]["calories"] == 340
    assert p["totals"]["calories"] == sum(m["totals"]["calories"] for m in p["meals"])
    assert "Avoid: peanut" in calls[0] and "Breakfast: about" in calls[0]
    assert c.post("/api/coach/plan", json={"dining": "c4c"}).status_code == 200
    assert len(calls) == 1  # second request served from cache


def test_plan_falls_back_to_last_checked_draft(monkeypatch):
    async def runs_out(brief, menu_text, hall, checker):
        checker.check([_DraftMeal(period="Breakfast", items=[_DraftItem(name="Cage Free Eggs", servings=1)])])
        return None
    monkeypatch.setattr(coach, "_run_agent", runs_out)
    p = _app().post("/api/coach/plan", json={"dining": "c4c"}).json()
    assert [m["period"] for m in p["meals"]] == ["Breakfast"]


def test_plan_after_the_last_meal_skips_the_model(monkeypatch):
    monkeypatch.setattr(coach, "_now_mt", lambda: datetime.fromisoformat(f"{TODAY}T22:00:00-06:00"))

    async def never(*_a):
        raise AssertionError("model should not be called")
    monkeypatch.setattr(coach, "_run_agent", never)
    p = _app().post("/api/coach/plan", json={"dining": "c4c"}).json()
    assert p["meals"] == [] and "covered" in p["headline"]


def test_plan_daily_quota(monkeypatch):
    async def fake_agent(brief, menu_text, hall, checker):
        return _good_output()
    monkeypatch.setattr(coach, "_run_agent", fake_agent)
    monkeypatch.setattr(coach._quota, "per_key", 1)
    c = _app()
    assert c.post("/api/coach/plan", json={"dining": "c4c"}).status_code == 200
    monkeypatch.setattr(coach, "coach_plans_collection", FakeCollection())  # force a cache miss
    assert c.post("/api/coach/plan", json={"dining": "c4c"}).status_code == 429


# ── The real SDK tool loop against a mocked Messages API ───────────────────

def _msg(content, stop_reason):
    return {"id": "msg", "type": "message", "role": "assistant", "model": coach.COACH_MODEL, "content": content,
            "stop_reason": stop_reason, "stop_sequence": None, "usage": {"input_tokens": 10, "output_tokens": 10}}


def test_agent_loop_calls_check_plan_and_parses_final_plan(monkeypatch):
    draft = {"meals": [
        {"period": "Lunch", "items": [{"name": "Grilled Chicken Breast", "servings": 1}, {"name": "Brown Rice", "servings": 2}]},
        {"period": "Dinner", "items": [{"name": "Grilled Chicken Breast", "servings": 1.5}, {"name": "Brown Rice", "servings": 2}]},
    ]}
    final = {"headline": "On target.", "tips": ["Eat within an hour of the run."], "meals": [
        {**m, "title": m["period"] + " plate", "why": "Fits."} for m in draft["meals"]]}
    replies = [
        _msg([{"type": "tool_use", "id": "tu_1", "name": "check_plan", "input": draft}], "tool_use"),
        _msg([{"type": "text", "text": json.dumps(final)}], "end_turn"),
    ]
    requests = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        requests.append(json.loads(request.content))
        return httpx2.Response(200, json=replies[len(requests) - 1])
    client = anthropic.AsyncAnthropic(api_key="test", http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handler)))
    monkeypatch.setattr(coach, "_make_client", lambda: client)

    checker = _checker()
    out = asyncio.run(coach._run_agent("brief", "menu", "C4C", checker))

    assert out.headline == "On target." and len(out.meals) == 2
    assert checker.calls == 1
    first, second = requests
    assert first["model"] == coach.COACH_MODEL and first["tools"][0]["name"] == "check_plan"
    assert first["output_config"]["format"]["type"] == "json_schema"
    assert first["system"][1]["cache_control"] == {"type": "ephemeral"}
    tool_result = second["messages"][-1]["content"][0]
    assert tool_result["type"] == "tool_result" and tool_result["tool_use_id"] == "tu_1"
    assert json.loads(tool_result["content"][0]["text"] if isinstance(tool_result["content"], list) else tool_result["content"])["ok"] is True
