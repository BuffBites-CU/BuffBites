#!/usr/bin/env python3
# Link: https://colorado-diningmenus.nutrislice.com/menu/seec/seec-student-order-ahead

import json
import time
from datetime import date, timedelta
from pathlib import Path

import requests

API_BASE    = "https://colorado-diningmenus.api.nutrislice.com"
SCHOOL_SLUG = "seec"
MENU_SLUG   = "seec-student-order-ahead"
_today      = date.today()
START_DATE  = _today - timedelta(days=_today.weekday()) - timedelta(weeks=2)
MAX_WEEKS   = 6
OUTPUT      = Path(__file__).parent / "data" / "seec_dining_menus.json"

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


def fingerprint(week_days: list[dict]) -> frozenset[str]:
    names: set[str] = set()
    for day in week_days:
        for items in day["categories"].values():
            for item in items:
                names.add(item["name"].lower().strip())
    return frozenset(names)


def fetch_week(wk_start: date, session: requests.Session) -> dict:
    url = (
        f"{API_BASE}/menu/api/weeks/school/{SCHOOL_SLUG}"
        f"/menu-type/{MENU_SLUG}"
        f"/{wk_start.year}/{wk_start.month:02d}/{wk_start.day:02d}"
    )
    resp = session.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    return resp.json()


def main() -> None:
    result = {
        "dining_location": "SEEC Cafe",
        "url": "https://colorado-diningmenus.nutrislice.com/menu/seec/seec-student-order-ahead",
        "scrape_start_date": START_DATE.isoformat(),
        "repeat_info": None,
        "menus": [],
    }

    session = requests.Session()
    seen: list[tuple[frozenset, int, str]] = []

    for wk in range(1, MAX_WEEKS + 1):
        wk_start = START_DATE + timedelta(weeks=wk - 1)
        print(f"Fetching week {wk:>2}  ({wk_start}) ...")

        try:
            data = fetch_week(wk_start, session)
        except Exception as exc:
            print(f"  [skip] week {wk} — {exc}")
            time.sleep(0.5)
            continue

        raw = data.get("days") or []
        print(f"  [ok]   {len(raw)} days received")

        week_days: list[dict] = []
        for day_obj in raw:
            day_date = day_obj.get("date")
            if not day_date:
                continue
            items = day_obj.get("menu_items") or day_obj.get("items") or []
            cats = parse_day(items)
            if not cats:
                continue

            target = date.fromisoformat(day_date)
            day_entry = {
                "date": day_date,
                "day_of_week": target.strftime("%A"),
                "categories": cats,
            }
            n_items = sum(len(v) for v in cats.values())
            print(f"  {day_date} — {n_items} items in {len(cats)} stations")
            result["menus"].append(day_entry)
            week_days.append(day_entry)

        fp = fingerprint(week_days)
        if fp:
            for prev_fp, prev_wk, prev_start in seen:
                if fp == prev_fp:
                    gap = wk - prev_wk
                    print(f"\n*** Menu repeat detected! ***")
                    print(f"    Week {wk} ({wk_start})  ==  Week {prev_wk} ({prev_start})")
                    print(f"    The same menu cycle repeated after {gap} week(s).")
                    if result["repeat_info"] is None:
                        result["repeat_info"] = {
                            "first_seen_week":  prev_wk,
                            "first_seen_start": prev_start,
                            "repeat_week":      wk,
                            "repeat_start":     str(wk_start),
                            "gap_weeks":        gap,
                        }
            seen.append((fp, wk, str(wk_start)))

        time.sleep(0.5)

    if result["repeat_info"] is None:
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
