import json
from collections import Counter, defaultdict
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from pydantic_models.combo_models import (
    Combo,
    ComboResponse,
    CombosMap,
    DishVerificationError,
    verify_combos,
)

load_dotenv()

app = FastAPI(title="BuffBites API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

DATA_DIR = Path(__file__).parent.parent / "scraping_scripts" / "data"

DINING_FILES: dict[str, str] = {
    "alley":          "alley_dining_menus.json",
    "c4c":            "c4c_dining_menus.json",
    "libby":          "libby_dining_menus.json",
    "sewall":         "sewall_dining_menus.json",
    "village_center": "village_center_dining_menus.json",
}

# Minimum unique dishes needed for 9 combos × 2 dishes each
MIN_ITEMS_FOR_FULL_MENU = 18


@app.get("/")
def root():
    return {"message": "BuffBites API is running"}


@app.get("/api/combos/generate", response_model=ComboResponse)
def generate_combos(
    dining: str = Query(..., description="One of: " + ", ".join(DINING_FILES)),
    date: str | None = Query(None, description="YYYY-MM-DD, defaults to today"),
):
    if dining not in DINING_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid dining location. Must be one of: {', '.join(DINING_FILES)}",
        )

    from datetime import date as _date
    target_date = date or str(_date.today())

    # Load menu JSON
    file_path = DATA_DIR / DINING_FILES[dining]
    try:
        menu_data = json.loads(file_path.read_text())
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load menu data")

    # Find the day's menu
    day_menu = next((m for m in menu_data["menus"] if m["date"] == target_date), None)
    if not day_menu:
        raise HTTPException(
            status_code=404,
            detail=f"No menu found for {menu_data['dining_location']} on {target_date}",
        )

    # Build item list + verification index
    all_items: list[dict] = []
    menu_index: dict[str, str] = {}  # lowercase(name) -> station

    for station, items in day_menu.get("categories", {}).items():
        for item in items:
            name = (item.get("name") or "").strip()
            all_items.append({
                "name": name,
                "category": station,
                "calories": item.get("calories"),
                "protein_g": (item.get("nutrition") or {}).get("protein_g"),
                "is_vegan": item.get("is_vegan"),
                "is_vegetarian": item.get("is_vegetarian"),
                "dietary_labels": item.get("dietary_labels"),
            })
            if name:
                menu_index[name.lower()] = station

    if not all_items:
        raise HTTPException(status_code=404, detail="No menu items found for this date")

    # ── Group items by top-level station, then split into 3 meal-period buckets ──
    # Top-level station = everything before " - " (e.g. "Italian - Omelet Bar" → "Italian")
    station_groups: dict[str, list[dict]] = defaultdict(list)
    for item in all_items:
        top = item["category"].split(" - ")[0]
        station_groups[top].append(item)

    top_stations = list(station_groups.keys())
    n = len(top_stations)
    # Distribute stations as evenly as possible across 3 periods
    # e.g. 8 stations → 3, 3, 2  (ceiling-divide the first two, remainder for Dinner)
    b_end = (n + 2) // 3          # breakfast gets ceil(n/3)
    l_end = b_end + (n + 2) // 3  # lunch gets another ceil(n/3)
    meal_station_names = {
        "Breakfast": top_stations[:b_end],
        "Lunch":     top_stations[b_end:l_end],
        "Dinner":    top_stations[l_end:],
    }
    meal_items = {
        period: [item for s in names for item in station_groups[s]]
        for period, names in meal_station_names.items()
    }

    # ── Menu size pre-check ──────────────────────────────────────────────────
    unique_item_count = len(menu_index)
    print("\n" + "="*60)
    print("  MENU PRE-CHECK")
    print("="*60)
    print(f"  Dining hall   : {menu_data['dining_location']}")
    print(f"  Date          : {target_date} ({day_menu['day_of_week']})")
    print(f"  Top stations  : {len(top_stations)} — {top_stations}")
    print(f"  Unique items  : {unique_item_count}")
    for period, names in meal_station_names.items():
        print(f"  {period:10s}: {names} ({len(meal_items[period])} items)")

    # ── One Claude call per meal period ──────────────────────────────────────
    def _make_period_prompt(period: str, items: list[dict]) -> str:
        dessert_note = (
            "- Include a dessert item (cake, pastry, cookie, ice cream, soft serve, "
            "brownie, pudding, or any other sweet treat — NOT fruit) if one is available\n"
            if period in ("Lunch", "Dinner")
            else "- If a pastry or sweet baked good is available, feel free to include it\n"
        )
        return f"""You are a creative dining combo suggester for CU Boulder's {menu_data['dining_location']} dining hall.

Here are the available menu items for {period} ({day_menu['day_of_week']}, {target_date}):
{json.dumps(items, indent=2)}

Generate exactly 3 creative, well-balanced {period} combos. Each combo must:
- Have a fun, catchy name
- Include between 2 and 6 items from the list above — NEVER more than 6 dishes per combo
- {dessert_note}- Provide an approximate total calorie count
- Include a short description (why it works: taste, nutrition, balance)
- List relevant tags like "high-protein", "vegan", "low-carb", etc.

Rules:
- HARD LIMIT: each combo must have AT LEAST 2 and AT MOST 6 dishes — never go outside this range
- No dish may appear in more than one combo
- Use only items from the list above — do not invent dishes
- Each dish must include the exact "category" value from the menu data as its station

Respond with ONLY a JSON array of exactly 3 combo objects, no extra text:
[
  {{
    "title": "Combo Name",
    "dishes": [
      {{ "name": "Exact item name from menu", "station": "Exact category from menu" }},
      {{ "name": "Exact item name from menu", "station": "Exact category from menu" }}
    ],
    "description": "Why this combo is great",
    "approximate_calories": 600,
    "tags": ["high-protein", "vegetarian"]
  }}
]"""

    MAX_RETRIES = 3
    period_combos: dict[str, list] = {}

    for period in ("Breakfast", "Lunch", "Dinner"):
        items_for_period = meal_items[period]
        if not items_for_period:
            raise HTTPException(status_code=500, detail=f"No items available for {period}")

        prompt = _make_period_prompt(period, items_for_period)
        last_error: Exception | None = None
        period_result: list | None = None

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                message = client.messages.create(
                    model="claude-haiku-4-5",
                    max_tokens=2048,
                    messages=[{"role": "user", "content": prompt}],
                )
                raw_text: str = message.content[0].text
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Claude API error: {e}")

            cleaned = raw_text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            try:
                combos_raw = json.loads(cleaned)
            except json.JSONDecodeError:
                last_error = Exception(f"JSON parse failed: {raw_text[:200]}")
                continue

            # Validate each combo in the list
            print(f"\n  [{period}] attempt {attempt} — validating {len(combos_raw) if isinstance(combos_raw, list) else '?'} combos")
            try:
                if not isinstance(combos_raw, list) or len(combos_raw) != 3:
                    raise ValueError(f"Expected list of 3, got {type(combos_raw).__name__} len={len(combos_raw) if isinstance(combos_raw, list) else '?'}")
                validated = [Combo(**c) for c in combos_raw]
                period_result = validated
                for combo in validated:
                    print(f"    ✓ \"{combo.title}\" — {len(combo.dishes)} dishes, ~{combo.approximate_calories} cal")
                break
            except Exception as e:
                last_error = e
                print(f"    ✗ Validation failed: {e}")

        if period_result is None:
            raise HTTPException(status_code=500, detail=f"Failed to generate valid {period} combos after {MAX_RETRIES} attempts: {last_error}")

        period_combos[period] = period_result

    # ── Assemble CombosMap ───────────────────────────────────────────────────
    print("\n" + "="*60)
    print("  PYDANTIC VALIDATION")
    print("="*60)
    try:
        combos_map = CombosMap(
            Breakfast=period_combos["Breakfast"],
            Lunch=period_combos["Lunch"],
            Dinner=period_combos["Dinner"],
        )
        print("  [✓] CombosMap assembled successfully")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to assemble CombosMap: {e}")

    response = ComboResponse(
        dining_location=menu_data["dining_location"],
        date=target_date,
        day_of_week=day_menu["day_of_week"],
        combos=combos_map,
    )
    print("  [✓] ComboResponse model built successfully")

    # ── Dish verification ────────────────────────────────────────────────────
    print("\n" + "="*60)
    print("  DISH VERIFICATION")
    print("="*60)
    errors: list[DishVerificationError] = verify_combos(response, day_menu)

    hallucinated = [e for e in errors if e.issue == "dish not found in today's menu"]
    station_fixes = [e for e in errors if e.issue.startswith("wrong station")]

    total_dishes = sum(
        len(combo.dishes)
        for period in ("Breakfast", "Lunch", "Dinner")
        for combo in getattr(response.combos, period)
    )
    print(f"  Total dishes checked : {total_dishes}")
    print(f"  Hallucinations found : {len(hallucinated)}")
    print(f"  Station mismatches   : {len(station_fixes)}")

    if hallucinated:
        for e in hallucinated:
            print(f"  [✗] HALLUCINATION — [{e.meal_period}] \"{e.combo_title}\" → \"{e.dish_name}\"")
        print("="*60 + "\n")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Claude hallucinated dishes not present in today's menu",
                "hallucinated_dishes": [e.model_dump() for e in hallucinated],
            },
        )

    if station_fixes:
        for fix in station_fixes:
            correct = menu_index[fix.dish_name.strip().lower()]
            print(f"  [~] AUTO-CORRECT — \"{fix.dish_name}\": \"{fix.dish_station}\" → \"{correct}\"")
            for combo in getattr(response.combos, fix.meal_period):
                for dish in combo.dishes:
                    if dish.name == fix.dish_name:
                        dish.station = correct

    if not hallucinated and not station_fixes:
        print("  [✓] All dishes verified — no issues found")

    # ── Repeat dish check ────────────────────────────────────────────────────
    print("\n" + "="*60)
    print("  REPEAT DISH CHECK")
    print("="*60)

    all_dish_names = [
        dish.name.strip().lower()
        for period in ("Breakfast", "Lunch", "Dinner")
        for combo in getattr(response.combos, period)
        for dish in combo.dishes
    ]
    counts = Counter(all_dish_names)
    repeated = [(name, count) for name, count in counts.items() if count > 1]

    # Check same-period repeats
    period_repeats: list[str] = []
    for period in ("Breakfast", "Lunch", "Dinner"):
        seen: set[str] = set()
        for combo in getattr(response.combos, period):
            for dish in combo.dishes:
                key = dish.name.strip().lower()
                if key in seen:
                    period_repeats.append(f"[{period}] \"{dish.name}\"")
                seen.add(key)

    if period_repeats:
        for msg in period_repeats:
            print(f"  [✗] SAME-PERIOD REPEAT — {msg} used more than once in the same period")
    if repeated:
        for name, count in repeated:
            flag = "[✗]" if count > 1 else "[✓]"
            print(f"  {flag} \"{name}\" appears {count}x across all combos")
        if unique_item_count < MIN_ITEMS_FOR_FULL_MENU:
            print(f"  [!] Note: menu only had {unique_item_count} unique items — some repeats unavoidable")
    else:
        print("  [✓] Every dish is unique across all 9 combos — perfect diversity")

    # ── Final JSON response ──────────────────────────────────────────────────
    print("\n" + "="*60)
    print("  RESPONSE JSON")
    print("="*60)
    print(response.model_dump_json(indent=2))
    print("="*60 + "\n")

    return response
