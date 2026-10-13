"""Menu domain rules shared by the combos, vision and coach routers.

What counts as a dish (station and item filters), which dishes fit a dietary
preference, how dish names are matched, and the Mountain Time "today" that the
dining halls run on.
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from menu_store import CLOSED_HALLS

# Dining halls are in Boulder, CO — "today" follows Mountain Time, not UTC.
MT = ZoneInfo("America/Denver")


def today_mt() -> str:
    return datetime.now(MT).strftime("%Y-%m-%d")


def ensure_open(dining: str) -> None:
    """404 with a clear reason for halls that are temporarily closed."""
    if dining in CLOSED_HALLS:
        raise HTTPException(status_code=404, detail=CLOSED_HALLS[dining])


def check_date(value: str | None, earliest: int, latest: int, detail: str) -> str:
    """Parse a YYYY-MM-DD date (default: today, MT) and allow only `earliest`
    to `latest` days from today. 400 with `detail` outside that window."""
    today = date.fromisoformat(today_mt())
    if value is None:
        return today.isoformat()
    try:
        d = date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    if not earliest <= (d - today).days <= latest:
        raise HTTPException(status_code=400, detail=detail)
    return d.isoformat()


def name_key(name: str) -> str:
    """Match key: case- and whitespace-insensitive. Some scraped names contain
    double spaces ("Tomato Cheddar  Bagel") that a model will collapse."""
    return " ".join(name.split()).casefold()


def to_float(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


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


# ── Station / item classification ──────────────────────────────────────────

def classify_station(station: str) -> str:
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


def is_component_item(name: str) -> bool:
    """Return True if the item name indicates a condiment, sauce, or raw ingredient."""
    n = name.lower()
    if any(n.endswith(sfx) for sfx in _ITEM_EXCLUDE_SUFFIXES):
        return True
    if set(n.split()) & _ITEM_EXCLUDE_WORDS:
        return True
    return False


# ── Dietary preference filtering ───────────────────────────────────────────
# Preferences map to the scraped fields. Callers hard-filter with this, so a
# vegan user can never be shown a meat dish.

GLUTEN_ALLERGENS = {"wheat", "gluten", "barley", "rye"}
# Best-effort halal exclusion — the scraped data has no halal flag, so we drop
# items whose name clearly indicates pork or alcohol.
_HALAL_EXCLUDE_WORDS = {
    "pork", "bacon", "ham", "pepperoni", "prosciutto", "sausage", "chorizo",
    "salami", "pancetta", "lard", "wine", "beer", "rum", "bourbon", "vodka",
}


def passes_dietary(item: dict, prefs: set[str]) -> bool:
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
        if allergens & GLUTEN_ALLERGENS:
            return False
    if "halal" in prefs:
        words = set(item["name"].lower().split())
        if words & _HALAL_EXCLUDE_WORDS:
            return False
    return True
