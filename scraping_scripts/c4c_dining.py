#!/usr/bin/env python3
# Scrapes ALL C4C station menus and merges them by date.
# Stations: Italian, Latin, Persia, Kosher, Black Coats, Dessert Station, Asia,
#           + Smoke n' Grill / Wholesome Field (via the daily rotation slug)

import json
import time
from datetime import date, timedelta
from pathlib import Path

import requests

API_BASE    = "https://colorado-diningmenus.api.nutrislice.com"
SCHOOL_SLUG = "center-for-community"
START_DATE  = date(2026, 1, 5)
MAX_WEEKS   = 52
OUTPUT      = Path(__file__).parent / "data" / "c4c_dining_menus.json"

# (api_slug, display_prefix)
# prefix=None  → station-header names used as-is
#                (c4c-meal-of-the-day already labels headers "Smoke n' Grill", "Wholesome Field", etc.)
# prefix="Foo" → sub-stations become "Foo - <header>" to avoid name collisions across stations
STATION_SLUGS: list[tuple[str, str | None]] = [
    ("italian",             "Italian"),
    ("latin",               "Latin"),
    ("persian",             "Persia"),
    ("c4c-kosher",          "Kosher"),
    ("c4c-black-coats",     "Black Coats"),
    ("c4c-dessert-station", "Dessert Station"),
    ("c4c-asia-all-day",    "Asia"),
    ("smokin-grill",        "Smoke n' Grill"),
    ("c4c_wholesome-field", "Wholesome Field"),
]

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


def parse_day(items: list, prefix: str | None = None) -> dict[str, list]:
    """
    Parse a flat list of menu_items into {station: [item, ...]} dict.
    If prefix is given, station names become "<prefix> - <header>" (e.g. "Italian - Pizza Bar").
    Items with the same name are deduplicated within a station.
    """
    cats: dict[str, list] = {}
    station = prefix or "General"

    for item in items:
        if item.get("is_station_header"):
            food       = item.get("food") or {}
            raw_name   = (food.get("name") or item.get("text") or "General").strip()
            station    = f"{prefix} - {raw_name}" if prefix else raw_name
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
            "name":           name,
            "description":    (food.get("description") or "").strip(),
            "serving_size":   _serving(food),
            "calories":       rounded.get("calories", ""),
            "ingredients":    (food.get("ingredients") or food.get("synced_ingredients") or "").strip(),
            "allergens":      allergens,
            "dietary_labels": dietary,
            "is_vegan":       is_vegan,
            "is_vegetarian":  is_veg,
            "nutrition":      _nutrition(rounded),
        }

        if station not in cats:
            cats[station] = []
        cats[station].append(entry)

    return cats


def merge_categories(base: dict[str, list], new: dict[str, list]) -> None:
    """Merge new station→items into base in-place, deduplicating by item name."""
    for cat, items in new.items():
        if cat not in base:
            base[cat] = []
        existing = {i["name"].lower() for i in base[cat]}
        for item in items:
            if item["name"].lower() not in existing:
                base[cat].append(item)
                existing.add(item["name"].lower())


def fingerprint(week_days: list[dict]) -> frozenset[str]:
    names: set[str] = set()
    for day in week_days:
        for items in day["categories"].values():
            for item in items:
                names.add(item["name"].lower().strip())
    return frozenset(names)


def fetch_week(wk_start: date, slug: str, session: requests.Session) -> dict:
    url = (
        f"{API_BASE}/menu/api/weeks/school/{SCHOOL_SLUG}"
        f"/menu-type/{slug}"
        f"/{wk_start.year}/{wk_start.month:02d}/{wk_start.day:02d}"
    )
    resp = session.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    return resp.json()


def main() -> None:
    result = {
        "dining_location": "Center for Community (C4C)",
        "url": "https://colorado-diningmenus.nutrislice.com/menu/center-for-community",
        "scrape_start_date": START_DATE.isoformat(),
        "stations_scraped": [slug for slug, _ in STATION_SLUGS],
        "repeat_info": None,
        "menus": [],
    }

    session  = requests.Session()
    seen:    list[tuple[frozenset, int, str]] = []
    # Accumulate all day entries across weeks keyed by date to avoid duplicates
    days_index: dict[str, dict] = {}

    for wk in range(1, MAX_WEEKS + 1):
        wk_start = START_DATE + timedelta(weeks=wk - 1)
        print(f"\nWeek {wk:>2}  ({wk_start})")

        # Per-week merged data: date_str → merged categories dict
        week_merged: dict[str, dict[str, list]] = {}

        for slug, prefix in STATION_SLUGS:
            print(f"  [{slug}]", end=" ", flush=True)
            try:
                data = fetch_week(wk_start, slug, session)
            except Exception as exc:
                print(f"ERROR — {exc}")
                continue

            raw_days = data.get("days") or []
            fetched  = 0
            for day_obj in raw_days:
                day_date = day_obj.get("date")
                if not day_date:
                    continue
                items = day_obj.get("menu_items") or []
                cats  = parse_day(items, prefix)
                if not cats:
                    continue
                fetched += sum(len(v) for v in cats.values())
                if day_date not in week_merged:
                    week_merged[day_date] = {}
                merge_categories(week_merged[day_date], cats)

            print(f"{fetched} items across {len(raw_days)} days")
            time.sleep(0.2)   # polite rate-limit between slugs

        # Build day entries from merged data
        week_days: list[dict] = []
        for day_date in sorted(week_merged):
            target = date.fromisoformat(day_date)
            cats   = week_merged[day_date]
            n_items = sum(len(v) for v in cats.values())
            print(f"  {target.strftime('%a %b %d')} — {n_items} items in {len(cats)} stations")

            if day_date in days_index:
                # Already have this date — merge in any new items
                merge_categories(days_index[day_date]["categories"], cats)
            else:
                day_entry = {
                    "date":       day_date,
                    "day_of_week": target.strftime("%A"),
                    "categories": cats,
                }
                days_index[day_date] = day_entry
                result["menus"].append(day_entry)
            week_days.append(days_index[day_date])

        # Repeat detection (based on merged item fingerprint for the week)
        fp = fingerprint(week_days)
        if fp:
            for prev_fp, prev_wk, prev_start in seen:
                if fp == prev_fp:
                    gap = wk - prev_wk
                    print(f"\n*** Menu repeat detected! ***")
                    print(f"    Week {wk} ({wk_start})  ==  Week {prev_wk} ({prev_start})")
                    print(f"    The same menu cycle repeated after {gap} week(s).")
                    result["repeat_info"] = {
                        "first_seen_week":  prev_wk,
                        "first_seen_start": prev_start,
                        "repeat_week":      wk,
                        "repeat_start":     str(wk_start),
                        "gap_weeks":        gap,
                    }
                    _save(result, wk)
                    return
            seen.append((fp, wk, str(wk_start)))

        time.sleep(0.3)

    print(f"\nNo repeat found within {MAX_WEEKS} weeks.")
    _save(result, len(seen))


def _save(result: dict, n_weeks: int) -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    n_items = sum(sum(len(v) for v in day["categories"].values()) for day in result["menus"])
    print(f"\nSaved  → {OUTPUT}")
    print(f"Weeks  : {n_weeks}")
    print(f"Days   : {len(result['menus'])}")
    print(f"Items  : {n_items} total menu items")
    if result.get("repeat_info"):
        ri = result["repeat_info"]
        print(f"Repeat : after {ri['gap_weeks']} week(s)  (week {ri['first_seen_week']} → week {ri['repeat_week']})")


if __name__ == "__main__":
    main()
