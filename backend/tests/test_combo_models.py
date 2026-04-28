"""Tests for pydantic_models/combo_models.py — Combo validator and verify_combos."""
import pytest
from pydantic import ValidationError

from pydantic_models.combo_models import (
    Combo,
    ComboResponse,
    CombosMap,
    Dish,
    DishVerificationError,
    verify_combos,
)


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


def _make_response(breakfast=None, lunch=None, dinner=None) -> ComboResponse:
    return ComboResponse(
        dining_location="C4C",
        date="2025-01-15",
        day_of_week="Wednesday",
        combos=CombosMap(
            Breakfast=breakfast if breakfast is not None else [],
            Lunch=lunch if lunch is not None else [],
            Dinner=dinner if dinner is not None else [],
        ),
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


# ── verify_combos ──────────────────────────────────────────────────────────

class TestVerifyCombos:
    """
    day_menu shape mirrors what the real scraper writes:
    { "categories": { "<station>": [ {"name": ...}, ... ] } }
    """

    def _day_menu(self, entries: dict[str, list[str]]) -> dict:
        """Build a minimal day_menu from {station: [item_name, ...]}."""
        return {
            "categories": {
                station: [{"name": name} for name in names]
                for station, names in entries.items()
            }
        }

    # ── Happy path ────────────────────────────────────────────────────────

    def test_no_errors_when_all_dishes_match(self):
        dish = _make_dish("Scrambled Eggs", "Breakfast Bar")
        combo = Combo(
            title="Morning Start",
            dishes=[dish, _make_dish("Oatmeal", "Hot Cereal")],
            description="Healthy breakfast",
            approximate_calories=400,
            tags=["balanced"],
        )
        response = _make_response(breakfast=[combo])
        day_menu = self._day_menu(
            {"Breakfast Bar": ["Scrambled Eggs"], "Hot Cereal": ["Oatmeal"]}
        )
        assert verify_combos(response, day_menu) == []

    def test_case_insensitive_name_matching(self):
        combo = Combo(
            title="C",
            dishes=[
                _make_dish("scrambled eggs", "Breakfast Bar"),
                _make_dish("OATMEAL", "Hot Cereal"),
            ],
            description="d",
            approximate_calories=300,
            tags=[],
        )
        response = _make_response(breakfast=[combo])
        day_menu = self._day_menu(
            {"Breakfast Bar": ["Scrambled Eggs"], "Hot Cereal": ["Oatmeal"]}
        )
        assert verify_combos(response, day_menu) == []

    def test_whitespace_trimmed_in_matching(self):
        combo = Combo(
            title="C",
            dishes=[
                _make_dish("  Grilled Chicken  ", "Grill"),
                _make_dish("Rice", "Grill"),
            ],
            description="d",
            approximate_calories=600,
            tags=[],
        )
        response = _make_response(lunch=[combo])
        day_menu = self._day_menu({"Grill": ["Grilled Chicken", "Rice"]})
        assert verify_combos(response, day_menu) == []

    # ── Missing dish ──────────────────────────────────────────────────────

    def test_dish_not_in_menu_returns_error(self):
        combo = Combo(
            title="Ghost Combo",
            dishes=[
                _make_dish("Mystery Meat", "Grill"),
                _make_dish("Actual Rice", "Grill"),
            ],
            description="d",
            approximate_calories=500,
            tags=[],
        )
        response = _make_response(lunch=[combo])
        day_menu = self._day_menu({"Grill": ["Actual Rice"]})

        errors = verify_combos(response, day_menu)
        assert len(errors) == 1
        assert errors[0].dish_name == "Mystery Meat"
        assert errors[0].issue == "dish not found in today's menu"
        assert errors[0].meal_period == "Lunch"
        assert errors[0].combo_title == "Ghost Combo"

    def test_multiple_missing_dishes_all_reported(self):
        combo = Combo(
            title="Ghost",
            dishes=[
                _make_dish("Item A", "Grill"),
                _make_dish("Item B", "Grill"),
                _make_dish("Item C", "Grill"),
            ],
            description="d",
            approximate_calories=700,
            tags=[],
        )
        response = _make_response(dinner=[combo])
        day_menu = self._day_menu({"Grill": []})

        errors = verify_combos(response, day_menu)
        assert len(errors) == 3

    def test_empty_menu_all_dishes_missing(self):
        combo = _make_combo(n_dishes=2)
        response = _make_response(breakfast=[combo], lunch=[combo], dinner=[combo])
        errors = verify_combos(response, {"categories": {}})
        # 2 dishes × 3 periods = 6 errors
        assert len(errors) == 6

    # ── Wrong station ─────────────────────────────────────────────────────

    def test_wrong_station_returns_error(self):
        combo = Combo(
            title="Mixed Up",
            dishes=[
                _make_dish("Grilled Salmon", "Deli Bar"),   # actually in "Grill"
                _make_dish("Brown Rice", "Grill"),
            ],
            description="d",
            approximate_calories=550,
            tags=[],
        )
        response = _make_response(dinner=[combo])
        day_menu = self._day_menu({"Grill": ["Grilled Salmon", "Brown Rice"]})

        errors = verify_combos(response, day_menu)
        assert len(errors) == 1
        err = errors[0]
        assert err.dish_name == "Grilled Salmon"
        assert "wrong station" in err.issue
        assert "Grill" in err.issue
        assert err.dish_station == "Deli Bar"

    def test_wrong_station_does_not_fire_when_station_matches(self):
        combo = Combo(
            title="OK",
            dishes=[
                _make_dish("Grilled Salmon", "Grill"),
                _make_dish("Brown Rice", "Grill"),
            ],
            description="d",
            approximate_calories=550,
            tags=[],
        )
        response = _make_response(dinner=[combo])
        day_menu = self._day_menu({"Grill": ["Grilled Salmon", "Brown Rice"]})
        assert verify_combos(response, day_menu) == []

    # ── Mixed errors ──────────────────────────────────────────────────────

    def test_mixed_missing_and_wrong_station(self):
        combo = Combo(
            title="Trouble",
            dishes=[
                _make_dish("Phantom Dish", "Grill"),          # missing
                _make_dish("Grilled Salmon", "Wrong Station"), # wrong station
            ],
            description="d",
            approximate_calories=500,
            tags=[],
        )
        response = _make_response(dinner=[combo])
        day_menu = self._day_menu({"Grill": ["Grilled Salmon"]})

        errors = verify_combos(response, day_menu)
        issues = {e.dish_name: e.issue for e in errors}
        assert "Phantom Dish" in issues
        assert issues["Phantom Dish"] == "dish not found in today's menu"
        assert "Grilled Salmon" in issues
        assert "wrong station" in issues["Grilled Salmon"]

    # ── All meal periods iterated ──────────────────────────────────────────

    def test_errors_reported_across_all_meal_periods(self):
        missing = Combo(
            title="X",
            dishes=[_make_dish("Ghost", "Grill"), _make_dish("Also Ghost", "Grill")],
            description="d",
            approximate_calories=100,
            tags=[],
        )
        response = _make_response(
            breakfast=[missing], lunch=[missing], dinner=[missing]
        )
        day_menu = self._day_menu({"Grill": []})

        errors = verify_combos(response, day_menu)
        periods = {e.meal_period for e in errors}
        assert periods == {"Breakfast", "Lunch", "Dinner"}

    # ── DishVerificationError fields ──────────────────────────────────────

    def test_error_object_fields_populated(self):
        combo = Combo(
            title="My Combo",
            dishes=[
                _make_dish("Ghost Dish", "Soup Station"),
                _make_dish("Real Item", "Grill"),
            ],
            description="d",
            approximate_calories=300,
            tags=[],
        )
        response = _make_response(lunch=[combo])
        day_menu = self._day_menu({"Grill": ["Real Item"]})

        errors = verify_combos(response, day_menu)
        assert len(errors) == 1
        err = errors[0]
        assert isinstance(err, DishVerificationError)
        assert err.meal_period == "Lunch"
        assert err.combo_title == "My Combo"
        assert err.dish_name == "Ghost Dish"
        assert err.dish_station == "Soup Station"
