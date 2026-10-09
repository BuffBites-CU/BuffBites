#!/usr/bin/env python3
# Link: https://colorado-diningmenus.nutrislice.com/menu/the-alley/the-alley-at-farrand-s-all-day-id2009

import json
import time
from datetime import date, timedelta
from pathlib import Path

import requests

from menu_guard import guarded_write

API_BASE   = "https://colorado-diningmenus.api.nutrislice.com"
# Nutrislice renames/re-IDs The Alley's menus between semesters, which is why the
# old hardcoded (38643, 8911) pair silently returned empty weeks. We now discover
# the live school + menu types from the schools index and fall back to these.
FALLBACK_SOURCES: list[tuple[str | int, str | int]] = [
    ("the-alley", "the-alley-at-farrand-s-all-day-id2009"),
    (38643, 8911),
]
DISCOVERY_KEYWORDS = ("alley", "farrand")
_today     = date.today()
START_DATE = _today - timedelta(days=_today.weekday()) - timedelta(weeks=2)
WEEKS      = 6
OUTPUT     = Path(__file__).parent / "data" / "alley_dining_menus.json"

HEADERS = {
    "Accept": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Referer": "https://colorado-diningmenus.nutrislice.com/",
}

ALLERGEN_SLUGS = {
    "wheat", "milk", "eggs", "egg", "soy", "peanuts", "peanut",
    "tree-nuts", "tree-nut", "fish", "shellfish", "sesame",
    "mustard", "sulfites",
}
DIETARY_SLUGS = {
    "vegan", "vegetarian", "gluten-free", "halal",
    "kosher", "locally-grown", "whole-grain",
}


def _icons(icons: list) -> tuple[list, list, bool, bool]:
    allergens: list[str] = []
    dietary:   list[str] = []
    is_vegan = is_veg = False

    for icon in icons or []:
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


def _nutrition(info: dict | None) -> dict:
    if not info:
        return {}
    fields = {
        "calories":        info.get("calories"),
        "fat_g":           info.get("g_fat"),
        "saturated_fat_g": info.get("g_saturated_fat"),
        "trans_fat_g":     info.get("g_trans_fat"),
        "cholesterol_mg":  info.get("mg_cholesterol"),
        "sodium_mg":       info.get("mg_sodium"),
        "carbohydrates_g": info.get("g_carbs"),
        "fiber_g":         info.get("g_fiber"),
        "added_sugar_g":   info.get("g_added_sugar"),
        "total_sugar_g":   info.get("g_sugar"),
        "protein_g":       info.get("g_protein"),
        "potassium_mg":    info.get("mg_potassium"),
        "calcium_mg":      info.get("mg_calcium"),
        "iron_mg":         info.get("mg_iron"),
        "vitamin_d_mcg":   info.get("mcg_vitamin_d"),
    }
    return {k: v for k, v in fields.items() if v is not None}


def _serving(food: dict) -> str:
    ssi    = food.get("serving_size_info") or {}
    amount = ssi.get("serving_size_amount") or food.get("serving_size_amount", "")
    unit   = ssi.get("serving_size_unit")   or food.get("serving_size_unit", "")
    if amount and unit:
        return f"{amount} {unit}"
    return str(amount or unit or "")


def parse_day(items: list) -> dict[str, list]:
    cats: dict[str, list] = {}
    station = "General"

    for item in items:
        if item.get("is_station_header"):
            food    = item.get("food") or {}
            station = (food.get("name") or item.get("text") or "General").strip()
            if station not in cats:
                cats[station] = []
            continue

        food = item.get("food")
        if not food or not food.get("name"):
            continue

        name = food["name"].strip()
        if not name:
            continue

        allergens, dietary, is_vegan, is_veg = _icons(
            (food.get("icons") or {}).get("food_icons") or []
        )
        rounded = food.get("rounded_nutrition_info") or {}

        entry = {
            "name":          name,
            "description":   (food.get("description") or "").strip(),
            "serving_size":  _serving(food),
            "calories":      rounded.get("calories", ""),
            "ingredients":   (food.get("ingredients") or food.get("synced_ingredients") or "").strip(),
            "allergens":     allergens,
            "dietary_labels": dietary,
            "is_vegan":      is_vegan,
            "is_vegetarian": is_veg,
            "nutrition":     _nutrition(rounded),
        }

        if station not in cats:
            cats[station] = []
        cats[station].append(entry)

    return cats


def discover_sources(session: requests.Session) -> list[tuple[str | int, str | int]]:
    """Find every active menu type for any school matching The Alley / Farrand."""
    sources: list[tuple[str | int, str | int]] = []
    try:
        resp = session.get(f"{API_BASE}/menu/api/schools/", headers=HEADERS, timeout=20)
        resp.raise_for_status()
        schools = resp.json()
    except Exception as exc:
        print(f"Discovery failed — {exc}")
        return sources

    for school in schools if isinstance(schools, list) else []:
        haystack = f"{school.get('name', '')} {school.get('slug', '')}".lower()
        if not any(k in haystack for k in DISCOVERY_KEYWORDS):
            continue
        for mt in school.get("active_menu_types") or school.get("menu_types") or []:
            mt_key = mt.get("slug") or mt.get("id")
            if mt_key:
                sources.append((school.get("slug") or school.get("id"), mt_key))
                print(f"Discovered: {school.get('name')} → {mt.get('name')} ({mt_key})")
    return sources


def fetch_week(wk_start: date, school: str | int, menu_type: str | int, session: requests.Session) -> dict:
    url = (
        f"{API_BASE}/menu/api/weeks/school/{school}"
        f"/menu-type/{menu_type}"
        f"/{wk_start.year}/{wk_start.month:02d}/{wk_start.day:02d}"
    )
    resp = session.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    return resp.json()


def merge_categories(base: dict[str, list], new: dict[str, list]) -> None:
    for cat, items in new.items():
        bucket = base.setdefault(cat, [])
        existing = {i["name"].lower() for i in bucket}
        for item in items:
            if item["name"].lower() not in existing:
                bucket.append(item)
                existing.add(item["name"].lower())


def main() -> None:
    total_days = WEEKS * 7
    end_date   = START_DATE + timedelta(days=total_days - 1)

    result = {
        "dining_location": "The Alley at Farrand",
        "url": "https://colorado-diningmenus.nutrislice.com/menu/the-alley/the-alley-at-farrand-s-all-day-id2009",
        "date_range": {
            "start": START_DATE.isoformat(),
            "end":   end_date.isoformat(),
            "weeks": WEEKS,
        },
        "menus": [],
    }

    day_map: dict[str, dict] = {}
    session = requests.Session()

    sources = discover_sources(session)
    for fb in FALLBACK_SOURCES:
        if fb not in sources:
            sources.append(fb)

    for school, menu_type in sources:
        found = 0
        for wk in range(WEEKS):
            wk_start = START_DATE + timedelta(weeks=wk)
            try:
                data = fetch_week(wk_start, school, menu_type, session)
            except Exception as exc:
                print(f"  [{school}/{menu_type}] week {wk_start} ERROR — {exc}")
                continue

            for day_obj in data.get("days") or []:
                day_date = day_obj.get("date")
                items    = day_obj.get("menu_items") or day_obj.get("items") or []
                if not day_date or not items:
                    continue
                cats = parse_day(items)
                found += sum(len(v) for v in cats.values())
                merge_categories(day_map.setdefault(day_date, {}), cats)
            time.sleep(0.3)
        print(f"  [{school}/{menu_type}] {found} items")

    for i in range(total_days):
        target   = START_DATE + timedelta(days=i)
        date_str = target.isoformat()
        cats     = day_map.get(date_str, {})

        n_items = sum(len(v) for v in cats.values())
        print(f"  {target.strftime('%a %b %d')} — {n_items} items in {len(cats)} categories")

        result["menus"].append({
            "date":        date_str,
            "day_of_week": target.strftime("%A"),
            "categories":  cats,
        })

    guarded_write(OUTPUT, result)

    n_items = sum(sum(len(v) for v in day["categories"].values()) for day in result["menus"])
    print(f"\nSaved → {OUTPUT}")
    print(f"Total : {n_items} menu items across {total_days} days")


if __name__ == "__main__":
    main()
