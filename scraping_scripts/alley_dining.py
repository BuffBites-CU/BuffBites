#!/usr/bin/env python3
# Link: https://colorado-diningmenus.nutrislice.com/menu/the-alley/the-alley-at-farrand-s-all-day-id2009
"""
Scraper for The Alley at Farrand dining menu — CU Boulder

Uses the Nutrislice internal REST API directly (no browser needed):
  GET https://colorado-diningmenus.api.nutrislice.com/menu/api/weeks/school/38643/menu-type/8911/{year}/{month}/{day}

The weekly endpoint returns 7 days of menu data per call, so 3 calls cover 3 weeks.

Categories come from station-header items (is_station_header=True); every food
item that follows belongs to the most-recently-seen station.

Allergens and dietary labels (Vegan, Vegetarian, Gluten-Free …) are encoded as
icon objects inside food.icons.food_icons.

Output: alley_dining_menus.json  (same directory as this script)

Usage:
    pip install requests
    python alley_dining.py
"""

import json
import time
from datetime import date, timedelta
from pathlib import Path

import requests

# ── Config ────────────────────────────────────────────────────────────────────
API_BASE   = "https://colorado-diningmenus.api.nutrislice.com"
SCHOOL_ID  = 38643
MENU_TYPE  = 8911
START_DATE = date(2026, 3, 2)
WEEKS      = 3
OUTPUT     = Path(__file__).parent / "alley_dining_menus.json"

HEADERS = {
    "Accept": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Referer": "https://colorado-diningmenus.nutrislice.com/",
}

# Icon slugs the website uses for dietary/allergen labels
ALLERGEN_SLUGS = {
    "wheat", "milk", "eggs", "egg", "soy", "peanuts", "peanut",
    "tree-nuts", "tree-nut", "fish", "shellfish", "sesame",
    "mustard", "sulfites",
}
DIETARY_SLUGS = {
    "vegan", "vegetarian", "gluten-free", "halal",
    "kosher", "locally-grown", "whole-grain",
}


# ── Parsing helpers ───────────────────────────────────────────────────────────

def _parse_icons(food_icons: list) -> tuple[list, list, bool, bool]:
    """Return (allergens, dietary_labels, is_vegan, is_vegetarian)."""
    allergens: list[str] = []
    dietary:   list[str] = []
    is_vegan = is_veg = False

    for icon in food_icons or []:
        slug = (icon.get("slug") or icon.get("synced_name") or "").lower().replace(" ", "-")
        name = icon.get("name") or icon.get("synced_name") or slug

        if slug in ALLERGEN_SLUGS:
            allergens.append(name)
        if slug in DIETARY_SLUGS:
            dietary.append(name)
        if slug == "vegan":
            is_vegan = True
        if slug in ("vegetarian", "vegan"):
            is_veg = True

    return allergens, dietary, is_vegan, is_veg


def _parse_nutrition(info: dict | None) -> dict:
    if not info:
        return {}
    fields = {
        "calories":          info.get("calories"),
        "fat_g":             info.get("g_fat"),
        "saturated_fat_g":   info.get("g_saturated_fat"),
        "trans_fat_g":       info.get("g_trans_fat"),
        "cholesterol_mg":    info.get("mg_cholesterol"),
        "sodium_mg":         info.get("mg_sodium"),
        "carbohydrates_g":   info.get("g_carbs"),
        "fiber_g":           info.get("g_fiber"),
        "added_sugar_g":     info.get("g_added_sugar"),
        "total_sugar_g":     info.get("g_sugar"),
        "protein_g":         info.get("g_protein"),
        "potassium_mg":      info.get("mg_potassium"),
        "calcium_mg":        info.get("mg_calcium"),
        "iron_mg":           info.get("mg_iron"),
        "vitamin_d_mcg":     info.get("mcg_vitamin_d"),
    }
    return {k: v for k, v in fields.items() if v is not None}


def _serving_size(food: dict) -> str:
    ssi = food.get("serving_size_info") or {}
    amount = ssi.get("serving_size_amount") or food.get("serving_size_amount", "")
    unit   = ssi.get("serving_size_unit")   or food.get("serving_size_unit", "")
    if amount and unit:
        return f"{amount} {unit}"
    return str(amount or unit or "")


def parse_day(items: list) -> dict[str, list]:
    """
    Convert a flat list of menu item objects for one day into:
        { station_name: [ food_dict, ... ], ... }

    Items with is_station_header=True define the category; all following food
    items (is_station_header=False) belong to that category until the next
    header appears.
    """
    categories: dict[str, list] = {}
    current_station = "General"

    for item in items:
        if item.get("is_station_header"):
            # Station name lives on the food.name of the header item
            food = item.get("food") or {}
            current_station = food.get("name") or item.get("text") or "General"
            current_station = current_station.strip()
            if current_station not in categories:
                categories[current_station] = []
            continue

        food = item.get("food")
        if not food or not food.get("name"):
            continue  # blank line / section divider

        name = food["name"].strip()
        if not name:
            continue

        food_icons = (food.get("icons") or {}).get("food_icons") or []
        allergens, dietary_labels, is_vegan, is_veg = _parse_icons(food_icons)

        ingredients = (
            food.get("ingredients")
            or food.get("synced_ingredients")
            or ""
        ).strip()

        description = (food.get("description") or "").strip()

        entry = {
            "name":            name,
            "description":     description,
            "serving_size":    _serving_size(food),
            "calories":        (food.get("rounded_nutrition_info") or {}).get("calories", ""),
            "ingredients":     ingredients,
            "allergens":       allergens,
            "dietary_labels":  dietary_labels,
            "is_vegan":        is_vegan,
            "is_vegetarian":   is_veg,
            "nutrition":       _parse_nutrition(food.get("rounded_nutrition_info")),
        }

        if current_station not in categories:
            categories[current_station] = []
        categories[current_station].append(entry)

    return categories


# ── API fetch ─────────────────────────────────────────────────────────────────

def fetch_week(week_start: date, session: requests.Session) -> dict:
    """
    Fetch one week of menu data from the Nutrislice API.
    Returns the parsed JSON (keys: start_date, menu_type_id, days).
    """
    url = (
        f"{API_BASE}/menu/api/weeks/school/{SCHOOL_ID}"
        f"/menu-type/{MENU_TYPE}"
        f"/{week_start.year}/{week_start.month:02d}/{week_start.day:02d}"
    )
    resp = session.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    return resp.json()


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    total_days = WEEKS * 7
    end_date   = START_DATE + timedelta(days=total_days - 1)

    result = {
        "dining_location": "The Alley at Farrand",
        "url": (
            "https://colorado-diningmenus.nutrislice.com"
            "/menu/the-alley/the-alley-at-farrand-s-all-day-id2009"
        ),
        "date_range": {
            "start": START_DATE.isoformat(),
            "end":   end_date.isoformat(),
            "weeks": WEEKS,
        },
        "menus": [],
    }

    # Build a lookup: date string → parsed categories
    day_map: dict[str, dict] = {}

    session = requests.Session()

    for week in range(WEEKS):
        week_start = START_DATE + timedelta(weeks=week)
        print(f"Fetching week {week + 1}/{WEEKS}  ({week_start}) ...", end=" ", flush=True)

        try:
            data = fetch_week(week_start, session)
        except Exception as exc:
            print(f"ERROR — {exc}")
            continue

        days = data.get("days") or []
        print(f"{len(days)} days received")

        for day_obj in days:
            day_date = day_obj.get("date")
            items    = day_obj.get("menu_items") or day_obj.get("items") or []

            # Some API versions nest items differently
            if not items and isinstance(day_obj, dict):
                # Flatten from nested structure if present
                for key in ("sections", "menu_items", "items"):
                    items = day_obj.get(key) or []
                    if items:
                        break

            if day_date:
                day_map[day_date] = parse_day(items)

        time.sleep(0.5)  # polite crawl delay

    # Assemble output in chronological order for the requested date range
    for i in range(total_days):
        target   = START_DATE + timedelta(days=i)
        date_str = target.isoformat()
        cats     = day_map.get(date_str, {})

        n_items = sum(len(v) for v in cats.values())
        n_cats  = len(cats)
        print(f"  {target.strftime('%a %b %d')} — {n_items} items in {n_cats} categories")

        result["menus"].append({
            "date":        date_str,
            "day_of_week": target.strftime("%A"),
            "categories":  cats,
        })

    OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    total_items = sum(
        sum(len(v) for v in day["categories"].values())
        for day in result["menus"]
    )
    print(f"\nSaved → {OUTPUT}")
    print(f"Total : {total_items} menu items across {total_days} days")


if __name__ == "__main__":
    main()
