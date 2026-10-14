"""Scrape a dining hall's menus from the Nutrislice API.

Every hall works the same way: fetch each of its menu types (halls.py) one week
at a time for MAX_WEEKS weeks, parse the items into {station: [item, ...]},
merge them by date, record whether the menu cycle repeats, and save through
menu_guard. Each <hall>_dining.py just calls scrape() with its entry.
"""

import json
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from halls import Hall
from menu_guard import count_items, guarded_write

API_BASE  = "https://colorado-diningmenus.api.nutrislice.com"
DATA_DIR  = Path(__file__).parent / "data"
MAX_WEEKS = 6
TIMEOUT   = (10, 20)  # connect, read (seconds)

# {date: {station: [item, ...]}}: one week of a scrape, or a whole saved file.
Week = dict[str, dict[str, list]]

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


def today_mt() -> date:
    return datetime.now(ZoneInfo("America/Denver")).date()


def start_date(today: date) -> date:
    """The Monday two weeks before `today`, so the window always includes the current week."""
    return today - timedelta(days=today.weekday()) - timedelta(weeks=2)


def make_session() -> requests.Session:
    """Session that retries connection errors, 429 and 5xx with backoff.

    Read timeouts are retried only once, so a Nutrislice outage can't stretch
    a C4C run (54 requests) by minutes per request.
    """
    session = requests.Session()
    session.headers.update(HEADERS)
    retry = Retry(
        total=3, connect=3, read=1, backoff_factor=1,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
    )
    session.mount("https://", HTTPAdapter(max_retries=retry))
    return session


def fetch_week(session: requests.Session, school: str | int, menu_type: str | int, wk_start: date) -> dict:
    url = (
        f"{API_BASE}/menu/api/weeks/school/{school}"
        f"/menu-type/{menu_type}"
        f"/{wk_start.year}/{wk_start.month:02d}/{wk_start.day:02d}"
    )
    resp = session.get(url, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()


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
    """
    cats: dict[str, list] = {}
    station = prefix or "General"

    for item in items:
        if item.get("is_station_header"):
            food     = item.get("food") or {}
            raw_name = (food.get("name") or item.get("text") or "General").strip()
            station  = f"{prefix} - {raw_name}" if prefix else raw_name
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
    """Merge new station→items into base in-place.

    Items with the same name (any case) are kept once per station, so menus
    that reuse a header ("Featured Entree") add their dishes to it instead of
    replacing or dropping them.
    """
    for cat, items in new.items():
        bucket = base.setdefault(cat, [])
        existing = {i["name"].lower() for i in bucket}
        for item in items:
            if item["name"].lower() not in existing:
                bucket.append(item)
                existing.add(item["name"].lower())


def fingerprint(week: Week) -> frozenset[str]:
    names: set[str] = set()
    for cats in week.values():
        for items in cats.values():
            for item in items:
                names.add(item["name"].lower().strip())
    return frozenset(names)


def load_previous(output: Path) -> Week:
    """{date: categories} from the last saved scrape, or {} if there is none."""
    try:
        data = json.loads(output.read_text(encoding="utf-8"))
        return {d["date"]: d.get("categories") or {} for d in data.get("menus", []) if d.get("date")}
    except (OSError, ValueError, AttributeError):
        return {}


def fetch_weeks(
    session: requests.Session,
    sources: list[tuple[str | int, str | int, str | None]],
    start: date,
    previous: Week,
) -> tuple[list[tuple[date, Week]], list[str]]:
    """Fetch every (school, menu_type, prefix) source for each week from `start`.

    Returns ([(week start, {date: categories}), ...], failed requests). A failed
    request (after retries) doesn't drop the week: the previous scrape's days
    for that week are merged under whatever did load, so a transient error
    leaves slightly stale menus rather than missing ones.
    """
    out: list[tuple[date, Week]] = []
    failures: list[str] = []

    for wk in range(1, MAX_WEEKS + 1):
        wk_start = start + timedelta(weeks=wk - 1)
        print(f"\nWeek {wk:>2}  ({wk_start})")
        week: Week = {}
        failed = False

        for school, menu_type, prefix in sources:
            try:
                data = fetch_week(session, school, menu_type, wk_start)
            except Exception as exc:
                print(f"  [skip] {menu_type} — {exc}")
                failures.append(f"{school}/{menu_type} week of {wk_start}")
                failed = True
                continue

            raw_days = data.get("days") or []
            fetched  = 0
            for day_obj in raw_days:
                day_date = day_obj.get("date")
                if not day_date:
                    continue
                cats = parse_day(day_obj.get("menu_items") or day_obj.get("items") or [], prefix)
                if not cats:
                    # Closed that day. Left out of the JSON, same as a day Nutrislice doesn't list.
                    continue
                fetched += sum(len(v) for v in cats.values())
                merge_categories(week.setdefault(day_date, {}), cats)
            print(f"  [ok]   {menu_type} — {fetched} items across {len(raw_days)} days")
            time.sleep(0.2)   # polite rate-limit between requests

        if failed:
            # Nutrislice weeks run Sunday to Saturday around the requested Monday.
            lo = (wk_start - timedelta(days=1)).isoformat()
            hi = (wk_start + timedelta(days=6)).isoformat()
            kept = 0
            for day_date, cats in previous.items():
                if lo <= day_date < hi and cats:
                    merge_categories(week.setdefault(day_date, {}), cats)
                    kept += 1
            print(f"  [keep] {kept} days from the previous scrape")

        for day_date in sorted(week):
            cats = week[day_date]
            target = date.fromisoformat(day_date)
            print(f"  {target.strftime('%a %b %d')} — {sum(len(v) for v in cats.values())} items in {len(cats)} stations")
        out.append((wk_start, week))

    return out, failures


def to_menus(weeks: list[tuple[date, Week]]) -> list[dict]:
    """Date-sorted day entries for the JSON."""
    days: Week = {}
    for _, week in weeks:
        for day_date, cats in week.items():
            merge_categories(days.setdefault(day_date, {}), cats)
    return [
        {"date": d, "day_of_week": date.fromisoformat(d).strftime("%A"), "categories": days[d]}
        for d in sorted(days)
    ]


def find_repeat(weeks: list[tuple[date, Week]]) -> dict | None:
    """The first week whose dishes match an earlier week's. Empty weeks (breaks) are skipped."""
    seen: list[tuple[frozenset, int, date]] = []
    for wk, (wk_start, week) in enumerate(weeks, 1):
        fp = fingerprint(week)
        if not fp:
            continue
        for prev_fp, prev_wk, prev_start in seen:
            if fp == prev_fp:
                gap = wk - prev_wk
                print("\n*** Menu repeat detected! ***")
                print(f"    Week {wk} ({wk_start})  ==  Week {prev_wk} ({prev_start})")
                print(f"    The same menu cycle repeated after {gap} week(s).")
                return {
                    "first_seen_week":  prev_wk,
                    "first_seen_start": str(prev_start),
                    "repeat_week":      wk,
                    "repeat_start":     str(wk_start),
                    "gap_weeks":        gap,
                }
        seen.append((fp, wk, wk_start))
    print(f"\nNo repeat found within {len(weeks)} weeks.")
    return None


def save(
    output: Path, result: dict, failures: list[str], closed: bool = False, today: date | None = None
) -> None:
    """Write through menu_guard, then exit 1 if any request failed (unless the hall is closed)."""
    guarded_write(output, result, allow_empty=closed, incomplete=bool(failures), today=today)
    print(f"\nSaved  → {output}")
    print(f"Days   : {len(result['menus'])}")
    print(f"Items  : {count_items(result)} total menu items")
    if result.get("repeat_info"):
        ri = result["repeat_info"]
        print(f"Repeat : after {ri['gap_weeks']} week(s)  (week {ri['first_seen_week']} → week {ri['repeat_week']})")
    if failures and not closed:
        print(f"\n{len(failures)} request(s) failed; kept the previous scrape's days for those weeks:", file=sys.stderr)
        for failure in failures:
            print(f"  {failure}", file=sys.stderr)
        sys.exit(1)


def scrape(hall: Hall, session: requests.Session | None = None, today: date | None = None) -> None:
    output = DATA_DIR / hall.file
    today  = today or today_mt()
    start  = start_date(today)
    result: dict = {
        "dining_location": hall.name,
        "url": hall.url,
        "scrape_start_date": start.isoformat(),
    }
    if hall.list_menus:
        result["stations_scraped"] = [slug for slug, _ in hall.menus]

    sources = [(hall.school, slug, prefix) for slug, prefix in hall.menus]
    weeks, failures = fetch_weeks(session or make_session(), sources, start, load_previous(output))
    result["repeat_info"] = find_repeat(weeks)
    result["menus"] = to_menus(weeks)
    save(output, result, failures, closed=hall.closed, today=today)
