import json
import sys
from collections import defaultdict
from datetime import date as _date
from pathlib import Path

import anthropic
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict

from pydantic_models.combo_models import Combo, ComboResponse, CombosMap, Dish, verify_combos

router = APIRouter()

DATA_DIR = Path(__file__).parent.parent.parent / "scraping_scripts" / "data"

DINING_FILES: dict[str, str] = {
    "alley":          "alley_dining_menus.json",
    "c4c":            "c4c_dining_menus.json",
    "libby":          "libby_dining_menus.json",
    "sewall":         "sewall_dining_menus.json",
    "village_center": "village_center_dining_menus.json",
}

# ── Station classification keyword sets ────────────────────────────────────

_EXCLUDE_KEYWORDS = {
    "condiment", "dressing", "topping", "garnish", "sauce", "beverage",
    "milk", "butter", "syrup", "salt", "pepper", "oil", "vinegar",
    "water", "juice", "coffee", "tea", "cream", "spread",
}

# Matched against each " - "-separated component of the station name
_EXCLUDE_COMPONENT_EXACT = {
    "sides", "bread", "breads", "tortillas", "flour & corn tortillas",
    "gluten free bread", "deli bar cheeses", "deli bar meats",
    "deli bar breads", "protein", "proteins",
}

_BREAKFAST_KEYWORDS = {
    "breakfast", "omelet", "scramble", "egg", "waffle", "pancake",
    "cereal", "pastry", "bagel", "yogurt", "hot cereal", "granola",
    "french toast", "crepe",
}

_DESSERT_KEYWORDS = {"dessert", "ice cream", "soft serve"}
_LUNCH_KEYWORDS   = {"lunch"}
_DINNER_KEYWORDS  = {"dinner"}

# Item-level exclusions — suffixes that indicate condiments/spreads
_ITEM_EXCLUDE_SUFFIXES = (
    " sauce", " dressing", " oil", " vinegar", " butter",
    " syrup", " mayo", " mustard", " ketchup", " spread",
)

# Raw-prep words — "Diced Onion", "Medium Diced Yellow Onion", etc. are toppings not dishes
_ITEM_EXCLUDE_WORDS = {"diced", "sliced", "shredded", "chopped", "minced"}

# Max items sent to Claude per meal period (keeps prompt concise)
_MAX_ITEMS_PER_PERIOD = 25


# ── Pydantic models for Claude's structured JSON output ────────────────────
# extra="forbid" → generates additionalProperties:false, required by structured outputs

class _CDish(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    station: str


class _CCombo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str
    description: str
    dishes: list[_CDish]


class _CCombosOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    Breakfast: list[_CCombo]
    Lunch: list[_CCombo]
    Dinner: list[_CCombo]


# ── Station / item classification ──────────────────────────────────────────

def _classify_station(station: str) -> str:
    """Return 'breakfast', 'lunch', 'dinner', 'dessert', 'lunch_dinner', or 'excluded'."""
    s = station.lower()
    components = [c.strip() for c in s.split(" - ")]
    if any(c in _EXCLUDE_COMPONENT_EXACT for c in components):
        return "excluded"
    for kw in _EXCLUDE_KEYWORDS:
        if kw in s:
            return "excluded"
    for kw in _DESSERT_KEYWORDS:
        if kw in s:
            return "dessert"
    for kw in _BREAKFAST_KEYWORDS:
        if kw in s:
            return "breakfast"
    for kw in _DINNER_KEYWORDS:
        if kw in s:
            return "dinner"
    for kw in _LUNCH_KEYWORDS:
        if kw in s:
            return "lunch"
    return "lunch_dinner"


def _is_component_item(name: str) -> bool:
    """Return True if the item name indicates a condiment, sauce, or raw ingredient."""
    n = name.lower()
    if any(n.endswith(sfx) for sfx in _ITEM_EXCLUDE_SUFFIXES):
        return True
    if set(n.split()) & _ITEM_EXCLUDE_WORDS:
        return True
    return False


# ── Prompt-building helpers ────────────────────────────────────────────────

def _item_line(item: dict) -> str:
    """Format a single item as a bullet for the Claude prompt."""
    meta: list[str] = []
    if item.get("calories"):
        meta.append(f"{int(item['calories'])} cal")
    if item.get("protein_g"):
        meta.append(f"{item['protein_g']}g protein")
    if item.get("is_vegan"):
        meta.append("[vegan]")
    elif item.get("is_vegetarian"):
        meta.append("[vegetarian]")
    suffix = " | " + ", ".join(meta) if meta else ""
    return f"  • {item['name']} | station: {item['category']}{suffix}"


def _format_pool(items: list[dict], limit: int = _MAX_ITEMS_PER_PERIOD) -> str:
    if not items:
        return "  (none available)"
    return "\n".join(_item_line(i) for i in items[:limit])


# ── Post-processing helpers ────────────────────────────────────────────────

def _infer_tags(dishes_meta: list[dict]) -> list[str]:
    total_protein = sum(i.get("protein_g") or 0 for i in dishes_meta)
    total_cal     = sum(i.get("calories") or 0 for i in dishes_meta)
    all_vegan = all(i.get("is_vegan") for i in dishes_meta)
    all_veg   = all(i.get("is_vegetarian") for i in dishes_meta)
    tags: list[str] = []
    if all_vegan:
        tags.append("vegan")
    elif all_veg:
        tags.append("vegetarian")
    if total_protein >= 40:
        tags.append("high-protein")
    if total_cal < 500:
        tags.append("light")
    elif total_cal > 900:
        tags.append("hearty")
    return tags or ["balanced"]


def _enrich_combo(claude_combo: _CCombo, item_lookup: dict[str, dict]) -> Combo:
    """Attach calories, protein, and tags to a combo Claude generated."""
    meta: list[dict] = []
    for d in claude_combo.dishes:
        info = item_lookup.get(d.name.lower(), {})
        meta.append({
            "calories":      info.get("calories") or 0,
            "protein_g":     info.get("protein_g") or 0,
            "is_vegan":      info.get("is_vegan"),
            "is_vegetarian": info.get("is_vegetarian"),
        })
    return Combo(
        title=claude_combo.title,
        description=claude_combo.description,
        dishes=[Dish(name=d.name, station=d.station) for d in claude_combo.dishes],
        approximate_calories=int(sum(m["calories"] for m in meta)),
        tags=_infer_tags(meta),
    )


# ── Claude API call ────────────────────────────────────────────────────────

def _generate_with_claude(
    dining_location: str,
    date: str,
    day_of_week: str,
    breakfast_items: list[dict],
    lunch_items: list[dict],
    dinner_items: list[dict],
    dessert_items: list[dict],
) -> _CCombosOutput:
    client = anthropic.Anthropic()

    prompt = f"""You are a creative dining hall nutritionist building meal combo recommendations for {dining_location} on {day_of_week}, {date}.

STRICT RULES — follow every one exactly:
1. Only use items from the lists below. Copy each item's "name" and "station" EXACTLY as written (punctuation, asterisks, capitalization, and all).
2. Each combo must contain 2–6 dishes.
3. No dish may appear more than once across the 3 combos within the same meal period.
4. Return exactly 3 combos for Breakfast, 3 for Lunch, and 3 for Dinner.
5. The 3rd Dinner combo MUST be a dessert specialty (e.g., titled "Sweet Finale") built exclusively from the DESSERT ITEMS list:
   - If ice cream or soft serve is available, pair it with a cookie, brownie, cake, or fruit item.
   - If the dessert list is empty, make it a light plant-based dinner combo instead.
   - Never mix dinner and dessert items in this combo.
6. Give each combo a fun, creative title and a vivid one-sentence description.
7. Vary the style across the 3 combos per period: aim for one balanced/chef's pick, one high-protein, and one plant-based (vegetarian or vegan) where possible.

BREAKFAST ITEMS:
{_format_pool(breakfast_items)}

LUNCH ITEMS:
{_format_pool(lunch_items)}

DINNER ITEMS (do NOT use these in the dessert combo):
{_format_pool(dinner_items)}

DESSERT ITEMS (Sweet Finale only — do NOT mix with dinner items above):
{_format_pool(dessert_items, limit=20)}
"""

    response = client.messages.parse(
        model="claude-haiku-4-5",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
        output_format=_CCombosOutput,
    )
    return response.parsed_output


# ── Route ──────────────────────────────────────────────────────────────────

@router.get("/api/combos/generate", response_model=ComboResponse)
def generate_combos(
    dining: str = Query(..., description="One of: " + ", ".join(DINING_FILES)),
    date: str | None = Query(None, description="YYYY-MM-DD, defaults to today"),
):
    if dining not in DINING_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid dining location. Must be one of: {', '.join(DINING_FILES)}",
        )

    target_date = date or str(_date.today())
    file_path = DATA_DIR / DINING_FILES[dining]
    try:
        menu_data = json.loads(file_path.read_text())
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load menu data")

    day_menu = next((m for m in menu_data["menus"] if m["date"] == target_date), None)
    if not day_menu:
        raise HTTPException(
            status_code=404,
            detail=f"No menu found for {menu_data['dining_location']} on {target_date}",
        )

    # ── Classify every item by meal period ────────────────────────────────
    breakfast_items: list[dict] = []
    lunch_items:     list[dict] = []
    dinner_items:    list[dict] = []
    dessert_items:   list[dict] = []
    ld_station_items: dict[str, list[dict]] = defaultdict(list)

    for station, raw_items in day_menu.get("categories", {}).items():
        kind = _classify_station(station)
        if kind == "excluded":
            continue
        for raw in raw_items:
            name = (raw.get("name") or "").strip()
            if not name or _is_component_item(name):
                continue
            item = {
                "name":          name,
                "category":      station,
                "calories":      raw.get("calories"),
                "protein_g":     (raw.get("nutrition") or {}).get("protein_g"),
                "is_vegan":      raw.get("is_vegan"),
                "is_vegetarian": raw.get("is_vegetarian"),
            }
            if kind == "breakfast":
                breakfast_items.append(item)
            elif kind == "dessert":
                dessert_items.append(item)
            elif kind == "lunch":
                lunch_items.append(item)
            elif kind == "dinner":
                dinner_items.append(item)
            else:  # lunch_dinner — split by station below
                ld_station_items[station].append(item)

    # Split ambiguous stations evenly between lunch and dinner
    ld_stations = list(ld_station_items.keys())
    mid = max(len(ld_stations) // 2, 1)
    for s in ld_stations[:mid]:
        lunch_items.extend(ld_station_items[s])
    for s in ld_stations[mid:]:
        dinner_items.extend(ld_station_items[s])

    # Pad thin periods from a sibling period so Claude has enough to pick from
    def _pad(primary: list[dict], fallback: list[dict]) -> list[dict]:
        if len(primary) >= 6:
            return primary
        used = {i["name"].lower() for i in primary}
        return primary + [i for i in fallback if i["name"].lower() not in used]

    lunch_items     = _pad(lunch_items, dinner_items)
    dinner_items    = _pad(dinner_items, lunch_items)
    breakfast_items = _pad(breakfast_items, lunch_items)

    if not breakfast_items or not lunch_items or not dinner_items:
        raise HTTPException(status_code=404, detail="Not enough menu items to build combos")

    # ── Call Claude (LLM combo generation) ───────────────────────────────
    try:
        claude_output = _generate_with_claude(
            dining_location=menu_data["dining_location"],
            date=target_date,
            day_of_week=day_menu["day_of_week"],
            breakfast_items=breakfast_items,
            lunch_items=lunch_items,
            dinner_items=dinner_items,
            dessert_items=dessert_items,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Combo generation failed: {exc}")

    # ── Build lookup for calorie / tag enrichment ─────────────────────────
    all_items = breakfast_items + lunch_items + dinner_items + dessert_items
    item_lookup = {i["name"].lower(): i for i in all_items}

    def _enrich_period(combos: list[_CCombo]) -> list[Combo]:
        return [_enrich_combo(c, item_lookup) for c in combos]

    response = ComboResponse(
        dining_location=menu_data["dining_location"],
        date=target_date,
        day_of_week=day_menu["day_of_week"],
        combos=CombosMap(
            Breakfast=_enrich_period(claude_output.Breakfast),
            Lunch=_enrich_period(claude_output.Lunch),
            Dinner=_enrich_period(claude_output.Dinner),
        ),
    )

    # ── Pydantic verification — log any dish mismatches to stderr ─────────
    errors = verify_combos(response, day_menu)
    for err in errors:
        print(
            f"[COMBO VERIFY] {err.meal_period} / {err.combo_title} — "
            f'"{err.dish_name}": {err.issue}',
            file=sys.stderr,
        )

    return response


@router.get("/api/menu")
def get_menu(
    dining: str = Query(..., description="One of: " + ", ".join(DINING_FILES)),
    date: str | None = Query(None, description="YYYY-MM-DD, defaults to today"),
):
    """
    Returns raw menu items grouped by station for a given dining hall and date.
    Used by the Create page to display stations and dishes for combo building.
    Excludes condiments, dressings, and other utility stations using the same
    classifier as the combo generation endpoint.
    """
    if dining not in DINING_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid dining location. Must be one of: {', '.join(DINING_FILES)}",
        )

    target_date = date or str(_date.today())
    file_path = DATA_DIR / DINING_FILES[dining]
    try:
        menu_data = json.loads(file_path.read_text())
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load menu data")

    day_menu = next((m for m in menu_data["menus"] if m["date"] == target_date), None)
    if not day_menu:
        raise HTTPException(
            status_code=404,
            detail=f"No menu found for {menu_data['dining_location']} on {target_date}",
        )

    # Filter out excluded stations and component items
    filtered_categories: dict[str, list] = {}
    for station, raw_items in day_menu.get("categories", {}).items():
        if _classify_station(station) == "excluded":
            continue
        items = []
        for raw in raw_items:
            name = (raw.get("name") or "").strip()
            if not name or _is_component_item(name):
                continue
            items.append({
                "name":             name,
                "description":      raw.get("description", ""),
                "serving_size":     raw.get("serving_size", ""),
                "calories":         raw.get("calories"),
                "allergens":        raw.get("allergens", []),
                "dietary_labels":   raw.get("dietary_labels", []),
                "is_vegan":         raw.get("is_vegan", False),
                "is_vegetarian":    raw.get("is_vegetarian", False),
                "nutrition":        raw.get("nutrition", {}),
            })
        if items:
            filtered_categories[station] = items

    return {
        "dining_location": menu_data["dining_location"],
        "date": target_date,
        "day_of_week": day_menu["day_of_week"],
        "categories": filtered_categories,
    }
