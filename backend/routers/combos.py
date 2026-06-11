import hashlib
import json
import sys
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from zoneinfo import ZoneInfo

import anthropic
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict

from database import combo_cache_collection
from pydantic_models.combo_models import Combo, ComboResponse, CombosMap, Dish

router = APIRouter()

# Dining halls are in Boulder, CO — "today" follows Mountain Time, not UTC.
MT = ZoneInfo("America/Denver")

# ── Lightweight per-IP rate limiter ────────────────────────────────────────
# Combo generation is unauthenticated and calls the Anthropic API, so it needs
# abuse protection. An in-memory sliding window is sufficient at this scale
# (single instance); swap for Redis if you scale horizontally.
_RATE_LIMIT = 20          # requests
_RATE_WINDOW = 60         # seconds
_rate_hits: dict[str, deque] = defaultdict(deque)
_rate_lock = Lock()


def _check_rate_limit(client_ip: str) -> None:
    now = time.monotonic()
    with _rate_lock:
        hits = _rate_hits[client_ip]
        while hits and hits[0] <= now - _RATE_WINDOW:
            hits.popleft()
        if len(hits) >= _RATE_LIMIT:
            raise HTTPException(
                status_code=429,
                detail="Too many combo requests. Please wait a moment and try again.",
            )
        hits.append(now)


def _today_mt() -> str:
    return datetime.now(MT).strftime("%Y-%m-%d")


# In Docker the data is copied to backend/scraping_scripts/data; in local dev it
# lives at the repo root. Pick whichever exists so both layouts work.
_BACKEND_DIR = Path(__file__).parent.parent
DATA_DIR = next(
    (
        p
        for p in (
            _BACKEND_DIR / "scraping_scripts" / "data",
            _BACKEND_DIR.parent / "scraping_scripts" / "data",
        )
        if p.is_dir()
    ),
    _BACKEND_DIR / "scraping_scripts" / "data",
)
COMBO_PROMPT = (Path(__file__).parent.parent / "prompts" / "combos.txt").read_text()

DINING_FILES: dict[str, str] = {
    "alley":          "alley_dining_menus.json",
    "c4c":            "c4c_dining_menus.json",
    "libby":          "libby_dining_menus.json",
    "seec":           "seec_dining_menus.json",
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

# Per-station and total item caps for the prompt
_MAX_ITEMS_PER_STATION = 5   # prevents any one station from dominating
_MAX_ITEMS_PER_PERIOD  = 35  # total items per meal period sent to Claude


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
    for kw in _DESSERT_KEYWORDS:
        if kw in s:
            return "dessert"
    for kw in _EXCLUDE_KEYWORDS:
        if kw in s:
            return "excluded"
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


# ── Dietary preference filtering ───────────────────────────────────────────
# Hard-filters the item pool before it ever reaches Claude, so a vegan user
# can never be shown a meat dish. Preferences map to the scraped fields.

_GLUTEN_ALLERGENS = {"wheat", "gluten", "barley", "rye"}
# Best-effort halal exclusion — the scraped data has no halal flag, so we drop
# items whose name clearly indicates pork or alcohol.
_HALAL_EXCLUDE_WORDS = {
    "pork", "bacon", "ham", "pepperoni", "prosciutto", "sausage", "chorizo",
    "salami", "pancetta", "lard", "wine", "beer", "rum", "bourbon", "vodka",
}


def _passes_dietary(item: dict, prefs: set[str]) -> bool:
    """Return True if an item is allowed under the user's dietary preferences."""
    if not prefs:
        return True
    if "vegan" in prefs and not item.get("is_vegan"):
        return False
    # vegetarian users still accept vegan items (a vegan dish is vegetarian)
    if "vegetarian" in prefs and not (item.get("is_vegetarian") or item.get("is_vegan")):
        return False
    if "gluten-free" in prefs:
        allergens = {str(a).lower() for a in (item.get("allergens") or [])}
        if allergens & _GLUTEN_ALLERGENS:
            return False
    if "halal" in prefs:
        words = set(item["name"].lower().split())
        if words & _HALAL_EXCLUDE_WORDS:
            return False
    return True


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
    """Format items grouped by station so Claude clearly sees cross-station options."""
    if not items:
        return "  (none available)"

    # Group items by station, preserving insertion order
    by_station: dict[str, list[dict]] = defaultdict(list)
    for item in items:
        by_station[item["category"]].append(item)

    lines: list[str] = []
    total = 0
    for station, station_items in by_station.items():
        if total >= limit:
            break
        # Readable label: strip leading "Area - " prefix for display
        label = station.split(" - ", 1)[-1] if " - " in station else station
        lines.append(f"[{label}]")
        for item in station_items[:_MAX_ITEMS_PER_STATION]:
            if total >= limit:
                break
            lines.append(_item_line(item))
            total += 1
        lines.append("")  # blank line between stations

    return "\n".join(lines).rstrip()


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
        approximate_protein_g=int(sum(m["protein_g"] for m in meta)),
        tags=_infer_tags(meta),
    )


def _menu_name_set(day_menu: dict) -> set[str]:
    """Lowercased set of every real dish name on the day's menu."""
    names: set[str] = set()
    for items in day_menu.get("categories", {}).values():
        for it in items:
            n = (it.get("name") or "").strip().lower()
            if n:
                names.add(n)
    return names


def _build_period(
    combos: list[_CCombo],
    item_lookup: dict[str, dict],
    valid_names: set[str],
    period: str,
) -> list[Combo]:
    """Enrich Claude's combos, dropping any hallucinated dishes (and combos that
    fall below the 2-dish minimum once their fake dishes are removed)."""
    out: list[Combo] = []
    for c in combos:
        kept = [d for d in c.dishes if d.name.strip().lower() in valid_names]
        if len(kept) != len(c.dishes):
            dropped = [d.name for d in c.dishes if d not in kept]
            print(
                f"[COMBO DROP] {period} / {c.title!r} — removed hallucinated dishes: {dropped}",
                file=sys.stderr,
            )
        if len(kept) < 2:
            print(
                f"[COMBO DROP] {period} / {c.title!r} — fewer than 2 real dishes left, skipping combo",
                file=sys.stderr,
            )
            continue
        c.dishes = kept
        out.append(_enrich_combo(c, item_lookup))
    return out


# ── Claude API call ────────────────────────────────────────────────────────

_FOCUS_DESCRIPTIONS: dict[str, str] = {
    "balanced":     "balanced macros — variety of protein, carbs, and healthy fats",
    "high-protein": "maximum protein — prioritize meat, fish, eggs, tofu, and legumes",
    "low-carb":     "minimal carbohydrates — skip pasta, rice, and bread; favor protein and vegetables",
    "weight-loss":  "low calorie density — lean proteins, vegetables, and small portions",
    "muscle-gain":  "calorie surplus with high protein — lean meat + complex carbs for recovery",
    "endurance":    "sustained energy — complex carbs + moderate protein, easy on heavy fats",
}

_NUTRIENT_DESCRIPTIONS: dict[str, str] = {
    "iron":       "Iron — red meat, dark leafy greens, legumes, fortified cereals",
    "calcium":    "Calcium — dairy, fortified plant milk, broccoli, kale",
    "vitamin-d":  "Vitamin D — fatty fish, eggs, fortified foods",
    "fiber":      "Fiber — beans, whole grains, fruits, cruciferous vegetables",
    "omega-3":    "Omega-3 — salmon, tuna, flaxseed, walnuts",
    "b12":        "Vitamin B12 — meat, fish, eggs, dairy, fortified cereals",
    "zinc":       "Zinc — meat, shellfish, legumes, seeds",
}


def _build_goals_section(
    protein_goal: int | None,
    dietary_focus: str | None,
    priority_nutrients: list[str],
    dietary_prefs: set[str] | None = None,
) -> str:
    dietary_prefs = dietary_prefs or set()
    if not protein_goal and not dietary_focus and not priority_nutrients and not dietary_prefs:
        return ""
    lines = ["USER NUTRITIONAL GOALS (tailor every combo to meet these targets):"]
    if dietary_prefs:
        pretty = ", ".join(sorted(p.replace("-", " ") for p in dietary_prefs))
        lines.append(
            f"• Dietary requirement (MANDATORY): every dish in every combo must be {pretty}. "
            "The items below are already filtered to match — never add anything that violates this."
        )
    if protein_goal:
        lines.append(f"• Protein: aim for at least {protein_goal}g per meal — include high-protein items in each combo")
    if dietary_focus and dietary_focus in _FOCUS_DESCRIPTIONS:
        lines.append(f"• Focus: {dietary_focus.replace('-', ' ').title()} — {_FOCUS_DESCRIPTIONS[dietary_focus]}")
    if priority_nutrients:
        nutrient_lines = [_NUTRIENT_DESCRIPTIONS[n] for n in priority_nutrients if n in _NUTRIENT_DESCRIPTIONS]
        if nutrient_lines:
            lines.append("• Priority nutrients to include:")
            for nl in nutrient_lines:
                lines.append(f"  – {nl}")
    return "\n".join(lines) + "\n\n"


def _generate_with_claude(
    dining_location: str,
    date: str,
    day_of_week: str,
    breakfast_items: list[dict],
    lunch_items: list[dict],
    dinner_items: list[dict],
    dessert_items: list[dict],
    goals_section: str = "",
) -> _CCombosOutput:
    client = anthropic.Anthropic()

    prompt = COMBO_PROMPT.format(
        dining_location=dining_location,
        day_of_week=day_of_week,
        date=date,
        user_goals_section=goals_section,
        breakfast_items=_format_pool(breakfast_items),
        lunch_items=_format_pool(lunch_items),
        dinner_items=_format_pool(dinner_items),
        dessert_items=_format_pool(dessert_items, limit=20),
    )

    response = client.messages.parse(
        model="claude-haiku-4-5",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
        output_format=_CCombosOutput,
    )
    return response.parsed_output


# ── Caching ─────────────────────────────────────────────────────────────────

_VALID_DIETARY_PREFS = {"vegan", "vegetarian", "gluten-free", "halal"}


def _cache_key(
    dining: str,
    date: str,
    protein_goal: int | None,
    dietary_focus: str | None,
    nutrients: list[str],
    dietary_prefs: set[str],
) -> str:
    """Stable cache key — combos are deterministic for a given menu + preferences."""
    raw = "|".join([
        dining,
        date,
        str(protein_goal or ""),
        dietary_focus or "",
        ",".join(sorted(nutrients)),
        ",".join(sorted(dietary_prefs)),
    ])
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Route ──────────────────────────────────────────────────────────────────

@router.get("/api/combos/generate", response_model=ComboResponse)
async def generate_combos(
    request: Request,
    dining: str = Query(..., description="One of: " + ", ".join(DINING_FILES)),
    date: str | None = Query(None, description="YYYY-MM-DD, defaults to today"),
    protein_goal: int | None = Query(None, description="Target protein per meal in grams"),
    dietary_focus: str | None = Query(None, description="balanced|high-protein|low-carb|weight-loss|muscle-gain|endurance"),
    priority_nutrients: str | None = Query(None, description="Comma-separated: iron,calcium,vitamin-d,fiber,omega-3,b12,zinc"),
    dietary_preferences: str | None = Query(None, description="Comma-separated: vegan,vegetarian,gluten-free,halal"),
):
    _check_rate_limit(request.client.host if request.client else "unknown")

    if dining not in DINING_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid dining location. Must be one of: {', '.join(DINING_FILES)}",
        )

    target_date = date or _today_mt()

    # ── Normalize preferences and check the cache before any expensive work ──
    nutrient_list = [n.strip() for n in (priority_nutrients or "").split(",") if n.strip()]
    dietary_prefs = {
        p.strip().lower()
        for p in (dietary_preferences or "").split(",")
        if p.strip().lower() in _VALID_DIETARY_PREFS
    }
    cache_key = _cache_key(dining, target_date, protein_goal, dietary_focus, nutrient_list, dietary_prefs)

    cached = await combo_cache_collection.find_one({"key": cache_key})
    if cached:
        return ComboResponse(**cached["response"])

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
                "allergens":     raw.get("allergens", []),
            }
            # Hard-filter the pool so dishes that violate the user's dietary
            # preferences never reach Claude in the first place.
            if not _passes_dietary(item, dietary_prefs):
                continue
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

    # ── Build user goals section for the prompt ───────────────────────────
    goals_section = _build_goals_section(protein_goal, dietary_focus, nutrient_list, dietary_prefs)

    # ── Call Claude (LLM combo generation) ───────────────────────────────
    # Anthropic's SDK call is blocking, so run it off the event loop.
    try:
        claude_output = await run_in_threadpool(
            _generate_with_claude,
            dining_location=menu_data["dining_location"],
            date=target_date,
            day_of_week=day_menu["day_of_week"],
            breakfast_items=breakfast_items,
            lunch_items=lunch_items,
            dinner_items=dinner_items,
            dessert_items=dessert_items,
            goals_section=goals_section,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Combo generation failed: {exc}")

    # ── Build lookup for calorie / tag enrichment ─────────────────────────
    all_items = breakfast_items + lunch_items + dinner_items + dessert_items
    item_lookup = {i["name"].lower(): i for i in all_items}
    valid_names = _menu_name_set(day_menu)

    response = ComboResponse(
        dining_location=menu_data["dining_location"],
        date=target_date,
        day_of_week=day_menu["day_of_week"],
        combos=CombosMap(
            Breakfast=_build_period(claude_output.Breakfast, item_lookup, valid_names, "Breakfast"),
            Lunch=_build_period(claude_output.Lunch, item_lookup, valid_names, "Lunch"),
            Dinner=_build_period(claude_output.Dinner, item_lookup, valid_names, "Dinner"),
        ),
    )

    # ── Log single-station violations ─────────────────────────────────────
    for period, combos in [
        ("Breakfast", response.combos.Breakfast),
        ("Lunch",     response.combos.Lunch),
        ("Dinner",    response.combos.Dinner),
    ]:
        for combo in combos:
            stations = {d.station for d in combo.dishes}
            if len(stations) == 1:
                print(
                    f"[CROSS-STATION WARN] {period} / {combo.title!r} "
                    f"uses only one station: {next(iter(stations))!r}",
                    file=sys.stderr,
                )

    # ── Cache the result (TTL index evicts it after expires_at) ───────────
    try:
        await combo_cache_collection.update_one(
            {"key": cache_key},
            {"$set": {
                "key": cache_key,
                "response": response.model_dump(),
                "expires_at": datetime.now(timezone.utc) + timedelta(hours=24),
            }},
            upsert=True,
        )
    except Exception as e:
        print(f"[COMBO CACHE] failed to store: {e}", file=sys.stderr)

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

    target_date = date or _today_mt()
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


@router.get("/api/menu/nutrition")
def get_nutrition(
    dining: str = Query(...),
    date: str | None = Query(None),
    dishes: str = Query(..., description="Comma-separated dish names"),
):
    """Return per-dish nutrition for the requested dish names from the scraped menu."""
    if dining not in DINING_FILES:
        raise HTTPException(status_code=400, detail="Invalid dining location")

    target_date = date or _today_mt()
    file_path = DATA_DIR / DINING_FILES[dining]
    try:
        menu_data = json.loads(file_path.read_text())
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load menu data")

    day_menu = next((m for m in menu_data["menus"] if m["date"] == target_date), None)
    if not day_menu:
        return {}

    # Build a case-insensitive lookup
    lookup: dict[str, dict] = {}
    for station, raw_items in day_menu.get("categories", {}).items():
        for raw in raw_items:
            name = (raw.get("name") or "").strip()
            if name:
                nutrition = raw.get("nutrition") or {}
                lookup[name.lower()] = {
                    "calories":    raw.get("calories"),
                    "protein_g":   nutrition.get("protein_g"),
                    "fat_g":       nutrition.get("fat_g"),
                    "carbs_g":     nutrition.get("carbohydrates_g"),
                    "serving_size":raw.get("serving_size", ""),
                }

    requested = [d.strip() for d in dishes.split(",") if d.strip()]
    return {name: lookup.get(name.lower(), {}) for name in requested}
