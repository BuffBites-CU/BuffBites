#!/usr/bin/env python3
# Link: https://colorado-diningmenus.nutrislice.com/menu/the-alley/the-alley-at-farrand-s-all-day-id2009

import json
import time
from datetime import date, timedelta
from pathlib import Path

import requests

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


def fetch_week(wk_start: date, session: requests.Session) -> dict:
    url = (
        f"{API_BASE}/menu/api/weeks/school/{SCHOOL_ID}"
        f"/menu-type/{MENU_TYPE}"
        f"/{wk_start.year}/{wk_start.month:02d}/{wk_start.day:02d}"
    )
    resp = session.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    return resp.json()


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

    for wk in range(WEEKS):
        wk_start = START_DATE + timedelta(weeks=wk)
        print(f"Fetching week {wk + 1}/{WEEKS}  ({wk_start}) ...", end=" ", flush=True)

        try:
            data = fetch_week(wk_start, session)
        except Exception as exc:
            print(f"ERROR — {exc}")
            continue

        days = data.get("days") or []
        print(f"{len(days)} days received")

        for day_obj in days:
            day_date = day_obj.get("date")
            items    = day_obj.get("menu_items") or day_obj.get("items") or []

            if not items and isinstance(day_obj, dict):
                for key in ("sections", "menu_items", "items"):
                    items = day_obj.get(key) or []
                    if items:
                        break

            if day_date:
                day_map[day_date] = parse_day(items)

        time.sleep(0.5)

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

    OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    n_items = sum(sum(len(v) for v in day["categories"].values()) for day in result["menus"])
    print(f"\nSaved → {OUTPUT}")
    print(f"Total : {n_items} menu items across {total_days} days")


if __name__ == "__main__":
    main()
