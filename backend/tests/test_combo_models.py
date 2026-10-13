"""Tests for the combo models and for how routers/combos.py handles AI combos:
the production dish filter (_build_period) and the generate/nutrition routes."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

import menu_store
from pydantic_models.combo_models import Combo, Dish
from routers import combos
from routers.combos import _CCombo, _CDish, _CPeriodOutput, _build_period
from tests.fakes import FakeCollection


# ── Helpers ────────────────────────────────────────────────────────────────

def _make_dish(name: str = "Scrambled Eggs", station: str = "Breakfast Bar") -> Dish:
    return Dish(name=name, station=station)


def _make_combo(n_dishes: int = 2) -> Combo:
    return Combo(
        title="Test Combo",
        dishes=[_make_dish(f"Dish {i}", "Grill") for i in range(n_dishes)],
        description="A test combo",
        approximate_calories=500,
        tags=["balanced"],
    )


# ── Dish model ─────────────────────────────────────────────────────────────

class TestDish:
    def test_valid_dish(self):
        d = Dish(name="Scrambled Eggs", station="Breakfast Bar")
        assert d.name == "Scrambled Eggs"
        assert d.station == "Breakfast Bar"

    def test_name_and_station_required(self):
        with pytest.raises(ValidationError):
            Dish(name="Eggs")  # missing station
        with pytest.raises(ValidationError):
            Dish(station="Grill")  # missing name


# ── Combo.check_dish_count validator ──────────────────────────────────────

class TestComboDishCountValidator:
    def test_minimum_two_dishes_accepted(self):
        combo = _make_combo(n_dishes=2)
        assert len(combo.dishes) == 2

    def test_maximum_six_dishes_accepted(self):
        combo = _make_combo(n_dishes=6)
        assert len(combo.dishes) == 6

    def test_one_dish_rejected(self):
        with pytest.raises(ValidationError, match="2–6"):
            Combo(
                title="Bad",
                dishes=[_make_dish()],
                description="Too few",
                approximate_calories=100,
                tags=[],
            )

    def test_zero_dishes_rejected(self):
        with pytest.raises(ValidationError, match="2–6"):
            Combo(
                title="Bad",
                dishes=[],
                description="Empty",
                approximate_calories=0,
                tags=[],
            )

    def test_seven_dishes_rejected(self):
        with pytest.raises(ValidationError, match="2–6"):
            Combo(
                title="Bad",
                dishes=[_make_dish(f"D{i}", "Grill") for i in range(7)],
                description="Too many",
                approximate_calories=1000,
                tags=[],
            )

    def test_three_dishes_accepted(self):
        combo = _make_combo(n_dishes=3)
        assert len(combo.dishes) == 3



# ── _build_period: the production check on Claude's combos ────────────────

def _pool_item(name: str, station: str, calories: int = 100, protein: float = 5, **flags) -> dict:
    """An item as generate_combos puts it in the diet-filtered pool."""
    return {"name": name, "category": station, "calories": calories, "protein_g": protein,
            "fat_g": 1, "carbs_g": 10, "is_vegan": flags.get("vegan"), "is_vegetarian": flags.get("vegetarian")}


def _lookup(*items: dict) -> dict[str, dict]:
    return {combos.name_key(i["name"]): i for i in items}


def _claude_combo(*dishes: tuple[str, str], title: str = "Test Combo") -> _CCombo:
    return _CCombo(title=title, description="d", dishes=[_CDish(name=n, station=st) for n, st in dishes])


class TestBuildPeriod:
    LOOKUP = _lookup(
        _pool_item("Scrambled Eggs", "Breakfast Bar", calories=200, protein=14),
        _pool_item("Oatmeal", "Hot Cereal", calories=150, protein=5),
        _pool_item("Grilled Chicken", "Grill", calories=250, protein=30),
        _pool_item("Rice", "Grill", calories=200, protein=4),
        _pool_item("Tomato Cheddar  Bagel", "Bakery", calories=300, protein=12),
    )

    def test_all_dishes_on_menu_are_kept_and_enriched(self):
        out = _build_period([_claude_combo(("Scrambled Eggs", "Breakfast Bar"), ("Oatmeal", "Hot Cereal"))],
                            self.LOOKUP, "Breakfast")
        assert len(out) == 1
        assert [d.name for d in out[0].dishes] == ["Scrambled Eggs", "Oatmeal"]
        assert out[0].approximate_calories == 350 and out[0].approximate_protein_g == 19

    def test_names_match_ignoring_case_and_whitespace_and_come_back_as_on_the_menu(self):
        out = _build_period([_claude_combo(("  scrambled eggs ", "Breakfast Bar"), ("OATMEAL", "Hot Cereal"),
                                           ("tomato cheddar bagel", "Bakery"))], self.LOOKUP, "Breakfast")
        assert [d.name for d in out[0].dishes] == ["Scrambled Eggs", "Oatmeal", "Tomato Cheddar  Bagel"]
        assert out[0].approximate_calories == 650

    def test_station_comes_from_the_menu_not_the_model(self):
        out = _build_period([_claude_combo(("Grilled Chicken", "Deli Bar"), ("Rice", "Grill"))], self.LOOKUP, "Dinner")
        assert [d.station for d in out[0].dishes] == ["Grill", "Grill"]

    def test_dish_not_in_pool_is_dropped(self):
        out = _build_period([_claude_combo(("Mystery Meat", "Grill"), ("Grilled Chicken", "Grill"), ("Rice", "Grill"))],
                            self.LOOKUP, "Lunch")
        assert [d.name for d in out[0].dishes] == ["Grilled Chicken", "Rice"]
        assert out[0].approximate_calories == 450  # the hallucinated dish adds nothing

    def test_combo_left_with_fewer_than_two_real_dishes_is_skipped(self):
        out = _build_period([
            _claude_combo(("Mystery Meat", "Grill"), ("Rice", "Grill"), title="Ghost"),
            _claude_combo(("Item A", "Grill"), ("Item B", "Grill"), ("Item C", "Grill"), title="All fake"),
            _claude_combo(("Grilled Chicken", "Grill"), ("Rice", "Grill"), title="Real"),
        ], self.LOOKUP, "Lunch")
        assert [c.title for c in out] == ["Real"]

    def test_empty_pool_drops_every_combo(self):
        assert _build_period([_claude_combo(("Rice", "Grill"), ("Oatmeal", "Hot Cereal"))], {}, "Lunch") == []

    def test_more_than_six_dishes_is_cut_to_six_instead_of_failing(self):
        names = [f"Dish {i}" for i in range(8)]
        lookup = _lookup(*[_pool_item(n, "Global Kitchen") for n in names])
        out = _build_period([_claude_combo(*[(n, "Global Kitchen") for n in names])], lookup, "Dinner")
        assert [d.name for d in out[0].dishes] == names[:6]
        assert out[0].approximate_calories == 600


# ── /api/combos/generate ──────────────────────────────────────────────────

DATE = "2026-10-12"


def _menu_day() -> dict:
    return {
        "date": DATE,
        "day_of_week": "Monday",
        "categories": {
            "Omelet Bar": [
                {"name": "Scrambled Eggs", "calories": 200, "is_vegetarian": True, "nutrition": {"protein_g": 14}},
                {"name": "Bacon", "calories": 200, "nutrition": {"protein_g": 12}},
            ],
            "Smoke n' Grill": [
                {"name": "Grilled Chicken Breast", "calories": 180, "nutrition": {"protein_g": 32}},
                {"name": "Pork Carnitas", "calories": 250, "nutrition": {"protein_g": 24}},
            ],
            "Wholesome Field": [
                {"name": "Brown Rice", "calories": 110, "is_vegan": True, "nutrition": {"protein_g": 2.5}},
                {"name": "Tofu Stir Fry", "calories": 220, "is_vegan": True, "nutrition": {"protein_g": 14}},
                {"name": "Ham, Cheese & Sausage Scramble", "calories": 400, "nutrition": {"protein_g": 25}},
            ],
            "Dessert Station": [
                {"name": "Fruit Sorbet", "calories": 120, "is_vegan": True, "nutrition": {"protein_g": 0}},
            ],
            "Condiment Bar": [{"name": "Ketchup", "calories": 20, "is_vegan": True}],
        },
    }


class FakeClaude:
    """Stands in for _generate_period_with_claude and records each call."""

    def __init__(self):
        self.calls: list[dict] = []
        self.combos: dict[str, list[_CCombo]] = {
            p: [_claude_combo(("Tofu Stir Fry", "Wholesome Field"), ("Brown Rice", "Wholesome Field"))]
            for p in ("Breakfast", "Lunch", "Dinner")
        }

    async def __call__(self, client, period_name, dining_location, date, day_of_week, items,
                       dessert_items=None, goals_section=""):
        self.calls.append({"period": period_name, "items": [i["name"] for i in items], "goals": goals_section})
        return _CPeriodOutput(combos=self.combos[period_name])


@pytest.fixture
def claude(monkeypatch):
    fake = FakeClaude()
    monkeypatch.setitem(menu_store._cache, "c4c", {"dining_location": "C4C", "menus": [_menu_day()]})
    monkeypatch.setattr(combos, "_generate_period_with_claude", fake)
    monkeypatch.setattr(combos, "_make_client", lambda: None)
    monkeypatch.setattr(combos, "combo_cache_collection", FakeCollection())
    combos._combo_limiter._hits.clear()
    combos._combo_quota.day = ""
    return fake


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(combos.router)
    return TestClient(app)


def _generate(c: TestClient, ip: str = "1.2.3.4", **params):
    return c.get("/api/combos/generate", params={"dining": "c4c", "date": DATE, **params},
                 headers={"Fly-Client-IP": ip})


def test_generate_keeps_only_dishes_that_pass_the_diet_filter(claude):
    claude.combos["Lunch"] = [_claude_combo(("Bacon", "Fruit - Breakfast"), ("Tofu Stir Fry", "Grill"),
                                            ("Brown Rice", "Grill"))]
    r = _generate(_client(), dietary_preferences="vegan")
    assert r.status_code == 200, r.text
    lunch = r.json()["combos"]["Lunch"][0]
    # Bacon is on the menu but not vegan, so it never reached the pool and is dropped.
    assert [(d["name"], d["station"]) for d in lunch["dishes"]] == [
        ("Tofu Stir Fry", "Wholesome Field"), ("Brown Rice", "Wholesome Field")]
    assert lunch["approximate_calories"] == 330
    assert "Bacon" not in claude.calls[1]["items"] and "Ketchup" not in claude.calls[1]["items"]


def test_generate_handles_a_combo_with_more_than_six_dishes(claude):
    dishes = [("Tofu Stir Fry", "x"), ("Brown Rice", "x"), ("Grilled Chicken Breast", "x"),
              ("Pork Carnitas", "x"), ("Scrambled Eggs", "x"), ("Bacon", "x"), ("Fruit Sorbet", "x")]
    claude.combos["Dinner"] = [_claude_combo(*dishes)]
    r = _generate(_client())
    assert r.status_code == 200, r.text
    assert len(r.json()["combos"]["Dinner"][0]["dishes"]) == 6


def test_unknown_goal_values_do_not_change_the_cache_key(claude):
    c = _client()
    assert _generate(c, dietary_focus="endurance", priority_nutrients="iron").status_code == 200
    assert len(claude.calls) == 3
    for params in (
        {"dietary_focus": "Endurance ", "priority_nutrients": "iron,bogus"},
        {"dietary_focus": "endurance", "priority_nutrients": "iron,iron", "dietary_preferences": "keto"},
        {"dietary_focus": "endurance", "priority_nutrients": "iron", "protein_goal": -5},
    ):
        assert _generate(c, **params).status_code == 200
    assert len(claude.calls) == 3  # every variant was a cache hit
    _generate(c, dietary_focus="x1")
    _generate(c, dietary_focus="x2")
    assert len(claude.calls) == 6  # both made-up focuses share the no-focus entry


def test_protein_goal_is_clamped(claude):
    assert _generate(_client(), protein_goal=5000).status_code == 200
    assert "at least 300g per meal" in claude.calls[0]["goals"]


def test_results_with_an_empty_period_are_not_cached(claude):
    claude.combos["Lunch"] = [_claude_combo(("Lobster", "Grill"), ("Caviar", "Grill"))]
    c = _client()
    r = _generate(c)
    assert r.status_code == 200 and r.json()["combos"]["Lunch"] == []
    assert combos.combo_cache_collection.docs == []
    _generate(c)
    assert len(claude.calls) == 6


def test_cache_key_follows_menu_edits(claude):
    c = _client()
    _generate(c)
    _generate(c)
    assert len(claude.calls) == 3
    day = menu_store._cache["c4c"]["menus"][0]
    day["categories"]["Wholesome Field"].append({"name": "Quinoa Salad", "calories": 180, "is_vegan": True})
    _generate(c)
    assert len(claude.calls) == 6


def test_daily_cap_per_ip_counts_only_cache_misses(claude, monkeypatch):
    monkeypatch.setattr(combos._combo_quota, "per_key", 1)
    c = _client()
    assert _generate(c).status_code == 200
    assert _generate(c).status_code == 200  # cache hit: free
    assert _generate(c, protein_goal=40).status_code == 429
    assert _generate(c, ip="5.6.7.8", protein_goal=40).status_code == 200


def test_daily_cap_for_the_whole_app(claude, monkeypatch):
    monkeypatch.setattr(combos._combo_quota, "total", 1)
    c = _client()
    assert _generate(c).status_code == 200
    r = _generate(c, ip="5.6.7.8", protein_goal=40)
    assert r.status_code == 503 and "paused" in r.json()["detail"]
    assert len(claude.calls) == 3


# ── /api/menu/nutrition ───────────────────────────────────────────────────

def test_nutrition_takes_one_dish_param_per_name(claude):
    r = _client().get("/api/menu/nutrition", params=[
        ("dining", "c4c"), ("date", DATE),
        ("dish", "Ham, Cheese & Sausage Scramble"), ("dish", "brown  rice"), ("dish", "Lobster"),
    ])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["Ham, Cheese & Sausage Scramble"]["calories"] == 400
    assert body["brown  rice"]["calories"] == 110
    assert body["Lobster"] == {}


def test_nutrition_still_reads_the_legacy_comma_separated_param(claude):
    r = _client().get("/api/menu/nutrition", params={"dining": "c4c", "date": DATE,
                                                     "dishes": "Brown Rice,Tofu Stir Fry"})
    assert set(r.json()) == {"Brown Rice", "Tofu Stir Fry"}
    assert r.json()["Tofu Stir Fry"]["protein_g"] == 14
