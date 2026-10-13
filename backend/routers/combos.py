import asyncio
import functools
import hashlib
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import anthropic
import structlog
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict

from database import combo_cache_collection
from menu_rules import (
    classify_station,
    ensure_open,
    is_component_item,
    name_key,
    passes_dietary,
    today_mt,
)
from menu_store import DINING_FILES, load_menu
from rate_limit import DailyQuota, SlidingWindowLimiter, client_ip
from pydantic_models.combo_models import Combo, ComboResponse, CombosMap, Dish

router = APIRouter()
logger = structlog.get_logger()

# Combo generation is unauthenticated and calls the Anthropic API, so it needs
# per-IP abuse protection. Cache misses (three paid calls each) also count
# against a daily cap per IP and one for the whole app, so the bill has a
# ceiling. Cache hits are free.
_combo_limiter = SlidingWindowLimiter(
    limit=20,
    window_seconds=60,
    detail="Too many combo requests. Please wait a moment and try again.",
)
_combo_quota = DailyQuota(
    per_key=int(os.getenv("COMBOS_DAILY_PER_IP", "40")),
    total=int(os.getenv("COMBOS_DAILY_TOTAL", "400")),
    today=today_mt,
    key_detail="You've hit today's limit for new combo suggestions. It resets at midnight.",
    total_detail="Combo suggestions are paused for today. The full menu is still in the Menu tab.",
)

_COMBOS_UNAVAILABLE = (
    "Combo suggestions aren't available right now. The full menu is still in the Menu tab."
)

COMBO_PERIOD_PROMPT = (Path(__file__).parent.parent / "prompts" / "combo_period.txt").read_text()

# Extra rules / item sections appended only for the Dinner prompt, which also
# carries the dessert ("Sweet Finale") combo.
_DINNER_EXTRA_RULES = (
    "8. The 3rd combo MUST be a dessert specialty (e.g., titled \"Sweet Finale\") built "
    "exclusively from the DESSERT ITEMS list:\n"
    "   - If ice cream or soft serve is available, pair it with a cookie, brownie, cake, or fruit item.\n"
    "   - If the dessert list is empty, make it a light plant-based dinner combo instead.\n"
    "   - Never mix dinner and dessert items in this combo."
)

# Per-station and total item caps for the prompt
_MAX_ITEMS_PER_STATION = 5   # prevents any one station from dominating
_MAX_ITEMS_PER_PERIOD  = 35  # total items per meal period sent to Claude
_MAX_DISHES_PER_COMBO  = 6   # Combo's own validator allows 2-6
_MAX_PROTEIN_GOAL      = 300


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


class _CPeriodOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    combos: list[_CCombo]


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
        info = item_lookup.get(name_key(d.name), {})
        meta.append({
            "calories":      info.get("calories") or 0,
            "protein_g":     info.get("protein_g") or 0,
            "fat_g":         info.get("fat_g") or 0,
            "carbs_g":       info.get("carbs_g") or 0,
            "is_vegan":      info.get("is_vegan"),
            "is_vegetarian": info.get("is_vegetarian"),
        })
    return Combo(
        title=claude_combo.title,
        description=claude_combo.description,
        dishes=[Dish(name=d.name, station=d.station) for d in claude_combo.dishes],
        approximate_calories=int(sum(m["calories"] for m in meta)),
        approximate_protein_g=int(sum(m["protein_g"] for m in meta)),
        approximate_fat_g=int(sum(m["fat_g"] for m in meta)),
        approximate_carbs_g=int(sum(m["carbs_g"] for m in meta)),
        tags=_infer_tags(meta),
    )


def _build_period(
    combos: list[_CCombo],
    item_lookup: dict[str, dict],
    period: str,
) -> list[Combo]:
    """Enrich Claude's combos, keeping only dishes from the diet-filtered pool
    (`item_lookup`, keyed by name_key). Names and stations come from the menu,
    not the model. Combos left with fewer than 2 real dishes are skipped, and
    ones with more than 6 are cut to 6."""
    out: list[Combo] = []
    for c in combos:
        kept = [
            _CDish(name=i["name"], station=i["category"])
            for d in c.dishes
            if (i := item_lookup.get(name_key(d.name)))
        ]
        dropped = [d.name for d in c.dishes if name_key(d.name) not in item_lookup]
        if dropped:
            logger.warning("combo_dishes_dropped", period=period, title=c.title, dropped=dropped)
        if len(kept) < 2:
            logger.warning("combo_skipped_too_few_dishes", period=period, title=c.title)
            continue
        if len(kept) > _MAX_DISHES_PER_COMBO:
            logger.warning("combo_truncated", period=period, title=c.title, dishes=len(kept))
            kept = kept[:_MAX_DISHES_PER_COMBO]
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


@functools.cache
def _make_client() -> anthropic.AsyncAnthropic:
    """One client per process, so its connection pool is reused across requests."""
    return anthropic.AsyncAnthropic()


async def _generate_period_with_claude(
    client: anthropic.AsyncAnthropic,
    period_name: str,
    dining_location: str,
    date: str,
    day_of_week: str,
    items: list[dict],
    dessert_items: list[dict] | None = None,
    goals_section: str = "",
) -> _CPeriodOutput:
    is_dinner = period_name == "Dinner"

    prompt = COMBO_PERIOD_PROMPT.format(
        dining_location=dining_location,
        day_of_week=day_of_week,
        date=date,
        user_goals_section=goals_section,
        period_name=period_name,
        period_name_upper=period_name.upper(),
        items=_format_pool(items),
        extra_rules=_DINNER_EXTRA_RULES if is_dinner else "",
        dessert_section=(
            "\nDESSERT ITEMS (Sweet Finale only — do NOT mix with dinner items above):\n"
            + _format_pool(dessert_items or [], limit=20)
            if is_dinner
            else ""
        ),
    )

    response = await client.messages.parse(
        model="claude-haiku-4-5",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
        output_format=_CPeriodOutput,
    )
    return response.parsed_output


# ── Caching ─────────────────────────────────────────────────────────────────

_VALID_DIETARY_PREFS = {"vegan", "vegetarian", "gluten-free", "halal"}


def _menu_hash(day_menu: dict) -> str:
    """Short fingerprint of the day's dishes, so combos cached before a re-scrape
    edited the menu aren't served after it."""
    entries = sorted(
        f"{station}\x1f{(raw.get('name') or '').strip()}"
        for station, raw_items in (day_menu.get("categories") or {}).items()
        for raw in raw_items
    )
    return hashlib.sha256("\n".join(entries).encode()).hexdigest()[:16]


def _cache_key(
    dining: str,
    date: str,
    protein_goal: int | None,
    dietary_focus: str | None,
    nutrients: list[str],
    dietary_prefs: set[str],
    menu_hash: str,
) -> str:
    """Stable cache key — combos are deterministic for a given menu + preferences."""
    raw = "|".join([
        dining,
        date,
        str(protein_goal or ""),
        dietary_focus or "",
        ",".join(sorted(nutrients)),
        ",".join(sorted(dietary_prefs)),
        menu_hash,
    ])
    return hashlib.sha256(raw.encode()).hexdigest()


def _normalize_goals(
    protein_goal: int | None,
    dietary_focus: str | None,
    priority_nutrients: str | None,
    dietary_preferences: str | None,
) -> tuple[int | None, str | None, list[str], set[str]]:
    """Drop unknown values and clamp the protein goal. The prompt ignores
    unknown values anyway; dropping them here keeps them out of the cache key,
    so made-up values can't force a paid cache miss."""
    if protein_goal is not None:
        protein_goal = min(protein_goal, _MAX_PROTEIN_GOAL) if protein_goal > 0 else None
    focus = (dietary_focus or "").strip().lower()
    focus = focus if focus in _FOCUS_DESCRIPTIONS else None
    nutrients = sorted({
        n.strip().lower()
        for n in (priority_nutrients or "").split(",")
        if n.strip().lower() in _NUTRIENT_DESCRIPTIONS
    })
    prefs = {
        p.strip().lower()
        for p in (dietary_preferences or "").split(",")
        if p.strip().lower() in _VALID_DIETARY_PREFS
    }
    return protein_goal, focus, nutrients, prefs


# ── Route ──────────────────────────────────────────────────────────────────

@router.get("/api/combos/generate", response_model=ComboResponse)
async def generate_combos(
    request: Request,
    dining: str = Query(..., description="One of: " + ", ".join(DINING_FILES)),
    date: str | None = Query(None, description="YYYY-MM-DD, defaults to today"),
    protein_goal: int | None = Query(None, description="Target protein per meal in grams (clamped to 1-300)"),
    dietary_focus: str | None = Query(None, description="balanced|high-protein|low-carb|weight-loss|muscle-gain|endurance"),
    priority_nutrients: str | None = Query(None, description="Comma-separated: iron,calcium,vitamin-d,fiber,omega-3,b12,zinc"),
    dietary_preferences: str | None = Query(None, description="Comma-separated: vegan,vegetarian,gluten-free,halal"),
):
    ip = client_ip(request)
    _combo_limiter.check(ip)

    if dining not in DINING_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid dining location. Must be one of: {', '.join(DINING_FILES)}",
        )
    ensure_open(dining)

    target_date = date or today_mt()
    protein_goal, dietary_focus, nutrient_list, dietary_prefs = _normalize_goals(
        protein_goal, dietary_focus, priority_nutrients, dietary_preferences,
    )

    # The menu is in memory, so loading it before the cache lookup is cheap and
    # lets the key follow menu edits.
    try:
        menu_data = await asyncio.to_thread(load_menu, dining)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load menu data")

    day_menu = next((m for m in menu_data["menus"] if m["date"] == target_date), None)
    if not day_menu:
        raise HTTPException(
            status_code=404,
            detail=f"No menu found for {menu_data['dining_location']} on {target_date}",
        )

    cache_key = _cache_key(
        dining, target_date, protein_goal, dietary_focus, nutrient_list, dietary_prefs,
        _menu_hash(day_menu),
    )
    cached = await combo_cache_collection.find_one({"key": cache_key})
    if cached:
        return ComboResponse(**cached["response"])

    # ── Classify every item by meal period ────────────────────────────────
    breakfast_items: list[dict] = []
    lunch_items:     list[dict] = []
    dinner_items:    list[dict] = []
    dessert_items:   list[dict] = []
    ld_station_items: dict[str, list[dict]] = defaultdict(list)

    for station, raw_items in day_menu.get("categories", {}).items():
        kind = classify_station(station)
        if kind == "excluded":
            continue
        for raw in raw_items:
            name = (raw.get("name") or "").strip()
            if not name or is_component_item(name):
                continue
            item = {
                "name":          name,
                "category":      station,
                "calories":      raw.get("calories"),
                "protein_g":     (raw.get("nutrition") or {}).get("protein_g"),
                "fat_g":         (raw.get("nutrition") or {}).get("fat_g"),
                "carbs_g":       (raw.get("nutrition") or {}).get("carbohydrates_g"),
                "is_vegan":      raw.get("is_vegan"),
                "is_vegetarian": raw.get("is_vegetarian"),
                "allergens":     raw.get("allergens", []),
            }
            # Hard-filter the pool so dishes that violate the user's dietary
            # preferences never reach Claude in the first place.
            if not passes_dietary(item, dietary_prefs):
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
    # Count against the daily caps only now, once the request is valid and
    # about to cost money.
    _combo_quota.take(ip)
    # One call per meal period, run concurrently, so total latency is roughly
    # the slowest single call instead of the sum of all three.
    client = _make_client()
    try:
        breakfast_output, lunch_output, dinner_output = await asyncio.gather(
            _generate_period_with_claude(
                client, "Breakfast", menu_data["dining_location"], target_date,
                day_menu["day_of_week"], breakfast_items, goals_section=goals_section,
            ),
            _generate_period_with_claude(
                client, "Lunch", menu_data["dining_location"], target_date,
                day_menu["day_of_week"], lunch_items, goals_section=goals_section,
            ),
            _generate_period_with_claude(
                client, "Dinner", menu_data["dining_location"], target_date,
                day_menu["day_of_week"], dinner_items, dessert_items=dessert_items,
                goals_section=goals_section,
            ),
        )
    # Never show provider error text to students; log it for us instead.
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
        logger.error("combos_anthropic_auth_failed", hint="check ANTHROPIC_API_KEY", error=str(exc))
        raise HTTPException(status_code=503, detail=_COMBOS_UNAVAILABLE)
    except anthropic.RateLimitError as exc:
        logger.warning("combos_anthropic_rate_limited", error=str(exc))
        raise HTTPException(status_code=503, detail="Combo suggestions are busy right now. Try again in a minute.")
    except (anthropic.APIStatusError, anthropic.APIConnectionError) as exc:
        logger.error("combos_anthropic_api_error", error=str(exc))
        raise HTTPException(status_code=502, detail=_COMBOS_UNAVAILABLE)
    except Exception as exc:
        logger.error("combos_generation_failed", error=repr(exc))
        raise HTTPException(status_code=500, detail=_COMBOS_UNAVAILABLE)

    # ── Keep only dishes from the diet-filtered pool; enrich from the menu ─
    all_items = breakfast_items + lunch_items + dinner_items + dessert_items
    item_lookup = {name_key(i["name"]): i for i in all_items}

    response = ComboResponse(
        dining_location=menu_data["dining_location"],
        date=target_date,
        day_of_week=day_menu["day_of_week"],
        combos=CombosMap(
            Breakfast=_build_period(breakfast_output.combos, item_lookup, "Breakfast"),
            Lunch=_build_period(lunch_output.combos, item_lookup, "Lunch"),
            Dinner=_build_period(dinner_output.combos, item_lookup, "Dinner"),
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
                logger.warning(
                    "combo_single_station", period=period, title=combo.title,
                    station=next(iter(stations)),
                )

    # ── Cache the result (TTL index evicts it after expires_at) ───────────
    # A period with no combos left is worth a fresh try, so don't keep it.
    if not all((response.combos.Breakfast, response.combos.Lunch, response.combos.Dinner)):
        logger.warning("combos_not_cached_empty_period", dining=dining, date=target_date)
        return response
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
        logger.warning("combo_cache_store_failed", error=str(e))

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
    ensure_open(dining)

    target_date = date or today_mt()
    try:
        menu_data = load_menu(dining)
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
        if classify_station(station) == "excluded":
            continue
        items = []
        for raw in raw_items:
            name = (raw.get("name") or "").strip()
            if not name or is_component_item(name):
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
    dish: list[str] = Query([], description="A dish name; repeat the parameter for each dish"),
    dishes: str | None = Query(None, description="Legacy: comma-separated dish names"),
):
    """Return per-dish nutrition for the requested dish names from the scraped menu.

    Dish names can contain commas ("Ham, Cheese & Sausage Scramble"), so each
    name comes in its own `dish` parameter. The comma-separated `dishes` form
    is still read for clients that haven't updated.
    """
    if dining not in DINING_FILES:
        raise HTTPException(status_code=400, detail="Invalid dining location")
    ensure_open(dining)

    requested = [d.strip() for d in dish if d.strip()]
    requested += [d.strip() for d in (dishes or "").split(",") if d.strip()]

    target_date = date or today_mt()
    try:
        menu_data = load_menu(dining)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load menu data")

    day_menu = next((m for m in menu_data["menus"] if m["date"] == target_date), None)
    if not day_menu:
        return {}

    # Case- and whitespace-insensitive lookup
    lookup: dict[str, dict] = {}
    for station, raw_items in day_menu.get("categories", {}).items():
        for raw in raw_items:
            name = (raw.get("name") or "").strip()
            if name:
                nutrition = raw.get("nutrition") or {}
                lookup[name_key(name)] = {
                    "calories":    raw.get("calories"),
                    "protein_g":   nutrition.get("protein_g"),
                    "fat_g":       nutrition.get("fat_g"),
                    "carbs_g":     nutrition.get("carbohydrates_g"),
                    "serving_size":raw.get("serving_size", ""),
                }

    return {name: lookup.get(name_key(name), {}) for name in requested}
