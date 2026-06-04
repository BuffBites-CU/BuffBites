from pydantic import BaseModel, field_validator


class Dish(BaseModel):
    name: str
    station: str


class Combo(BaseModel):
    title: str
    dishes: list[Dish]
    description: str
    approximate_calories: int
    approximate_protein_g: int = 0
    tags: list[str]

    @field_validator("dishes")
    @classmethod
    def check_dish_count(cls, v: list[Dish]) -> list[Dish]:
        if not (2 <= len(v) <= 6):
            raise ValueError(f"dishes must have 2–6 items, got {len(v)}")
        return v


class CombosMap(BaseModel):
    Breakfast: list[Combo]
    Lunch: list[Combo]
    Dinner: list[Combo]


class ComboResponse(BaseModel):
    dining_location: str
    date: str
    day_of_week: str
    combos: CombosMap


class DishVerificationError(BaseModel):
    meal_period: str
    combo_title: str
    dish_name: str
    dish_station: str
    issue: str


def verify_combos(response: ComboResponse, day_menu: dict) -> list[DishVerificationError]:
    """Verify all combo dishes exist in the day's menu and are assigned to the correct station."""
    menu_index: dict[str, str] = {}  # lowercase(name) -> actual station
    for station, items in day_menu.get("categories", {}).items():
        for item in items:
            name = (item.get("name") or "").strip()
            if name:
                menu_index[name.lower()] = station

    errors: list[DishVerificationError] = []
    for period in ("Breakfast", "Lunch", "Dinner"):
        for combo in getattr(response.combos, period):
            for dish in combo.dishes:
                key = dish.name.strip().lower()
                if key not in menu_index:
                    errors.append(DishVerificationError(
                        meal_period=period,
                        combo_title=combo.title,
                        dish_name=dish.name,
                        dish_station=dish.station,
                        issue="dish not found in today's menu",
                    ))
                elif menu_index[key] != dish.station:
                    errors.append(DishVerificationError(
                        meal_period=period,
                        combo_title=combo.title,
                        dish_name=dish.name,
                        dish_station=dish.station,
                        issue=f"wrong station: expected '{menu_index[key]}'",
                    ))
    return errors
