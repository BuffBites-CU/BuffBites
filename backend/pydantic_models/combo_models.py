"""
Pydantic models for the /api/combos/generate response.

Also provides `verify_combos` — call this after receiving Claude's response
to ensure every dish actually exists in the day's scraped menu data.

Usage:
    from pydantic_models.combo_models import ComboResponse, verify_combos
    import json, sys

    with open("scraping_scripts/data/c4c_dining_menus.json") as f:
        menu_data = json.load(f)

    day_menu = next(m for m in menu_data["menus"] if m["date"] == "2026-03-17")
    claude_json = { ... }   # parsed Claude response

    response = ComboResponse(**claude_json)
    errors = verify_combos(response, day_menu)
    if errors:
        print("Hallucinated dishes detected:", errors, file=sys.stderr)
        sys.exit(1)
"""

from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, model_validator


# ---------------------------------------------------------------------------
# Dish
# ---------------------------------------------------------------------------

class Dish(BaseModel):
    name: str
    station: str


# ---------------------------------------------------------------------------
# Combo
# ---------------------------------------------------------------------------

class Combo(BaseModel):
    title: str
    dishes: list[Dish]
    description: str
    approximate_calories: int
    tags: list[str]

    @model_validator(mode="after")
    def at_least_two_dishes(self) -> "Combo":
        if len(self.dishes) < 2:
            raise ValueError(f'Combo "{self.title}" must have at least 2 dishes')
        if len(self.dishes) > 4:
            raise ValueError(f'Combo "{self.title}" must have at most 4 dishes')
        return self


# ---------------------------------------------------------------------------
# MealPeriod
# ---------------------------------------------------------------------------

class MealPeriod(BaseModel):
    combos: list[Combo]

    @model_validator(mode="after")
    def exactly_three_combos(self) -> "MealPeriod":
        if len(self.combos) != 3:
            raise ValueError(f"Each meal period must have exactly 3 combos, got {len(self.combos)}")
        return self


# ---------------------------------------------------------------------------
# Top-level response
# ---------------------------------------------------------------------------

class CombosMap(BaseModel):
    Breakfast: list[Combo]
    Lunch: list[Combo]
    Dinner: list[Combo]

    @model_validator(mode="after")
    def three_per_period(self) -> "CombosMap":
        for period in ("Breakfast", "Lunch", "Dinner"):
            combos = getattr(self, period)
            if len(combos) != 3:
                raise ValueError(f"{period} must have exactly 3 combos, got {len(combos)}")
        return self


class ComboResponse(BaseModel):
    dining_location: str
    date: str
    day_of_week: str
    combos: CombosMap


# ---------------------------------------------------------------------------
# Dish verification
# ---------------------------------------------------------------------------

def _build_menu_index(day_menu: dict) -> dict[str, str]:
    """
    Returns a dict of { lowercase_dish_name: actual_station }
    built from the scraped day menu's categories.
    """
    index: dict[str, str] = {}
    for station, items in day_menu.get("categories", {}).items():
        for item in items:
            name = (item.get("name") or "").strip()
            if name:
                index[name.lower()] = station
    return index


class DishVerificationError(BaseModel):
    meal_period: Literal["Breakfast", "Lunch", "Dinner"]
    combo_title: str
    dish_name: str
    dish_station: str
    issue: str


def verify_combos(response: ComboResponse, day_menu: dict) -> list[DishVerificationError]:
    """
    Checks every dish in the combo response against the scraped menu.

    Validates:
    - The dish name exists (case-insensitive) in the day's menu
    - The station matches the scraped station for that item

    Returns a list of DishVerificationError — empty means all clear.
    """
    index = _build_menu_index(day_menu)
    errors: list[DishVerificationError] = []

    for period in ("Breakfast", "Lunch", "Dinner"):
        combos: list[Combo] = getattr(response.combos, period)
        for combo in combos:
            for dish in combo.dishes:
                key = dish.name.strip().lower()
                if key not in index:
                    errors.append(DishVerificationError(
                        meal_period=period,
                        combo_title=combo.title,
                        dish_name=dish.name,
                        dish_station=dish.station,
                        issue="dish not found in today's menu",
                    ))
                elif index[key] != dish.station:
                    errors.append(DishVerificationError(
                        meal_period=period,
                        combo_title=combo.title,
                        dish_name=dish.name,
                        dish_station=dish.station,
                        issue=f'wrong station: expected "{index[key]}", got "{dish.station}"',
                    ))

    return errors
