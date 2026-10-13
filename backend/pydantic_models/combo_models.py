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
    approximate_fat_g: int = 0
    approximate_carbs_g: int = 0
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

