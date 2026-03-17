import json
from collections import Counter
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from pydantic_models.combo_models import (
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
                "allergens": item.get("allergens"),
                "dietary_labels": item.get("dietary_labels"),
            })
            if name:
                menu_index[name.lower()] = station

    if not all_items:
        raise HTTPException(status_code=404, detail="No menu items found for this date")

    # ── Menu size pre-check ──────────────────────────────────────────────────
    unique_item_count = len(menu_index)
    stations = list(day_menu.get("categories", {}).keys())
    print("\n" + "="*60)
    print("  MENU PRE-CHECK")
    print("="*60)
    print(f"  Dining hall   : {menu_data['dining_location']}")
    print(f"  Date          : {target_date} ({day_menu['day_of_week']})")
    print(f"  Stations      : {len(stations)} — {stations}")
    print(f"  Unique items  : {unique_item_count}")
    if unique_item_count < MIN_ITEMS_FOR_FULL_MENU:
        print(f"  [!] WARNING: Only {unique_item_count} unique items available.")
        print(f"      Need {MIN_ITEMS_FOR_FULL_MENU}+ for 9 fully unique combos.")
        print(f"      Claude will minimise repeats but some cross-combo reuse may occur.")
    else:
        print(f"  [✓] Sufficient items for 9 unique combos")

    prompt = f"""You are a creative dining combo suggester for CU Boulder's {menu_data['dining_location']} dining hall.

Here are ALL of today's available menu items ({day_menu['day_of_week']}, {target_date}) across ALL stations:
{json.dumps(all_items, indent=2)}

Generate 9 creative, well-balanced meal combos organized into 3 meal periods: Breakfast, Lunch, and Dinner — with exactly 3 combos each. Each combo should:
- Have a fun, catchy name
- Include 2-4 items, freely mixing items from different stations/categories — cross-station combos are strongly encouraged
- Use items from as many different stations as possible across all 9 combos
- Provide an approximate total calorie count
- Include a short description explaining why it works (taste, nutrition, balance, etc.)
- List relevant tags like "high-protein", "vegan", "low-carb", etc.

Strict diversity rules:
- Every dish must appear in AT MOST 1 combo across the entire response — NO dish may be reused in any other combo
- Each combo within a meal period must use a completely different set of dishes from the other combos in that period
- If the total number of unique menu items is less than 18, generate as many non-repeating combos as possible and reduce dish count per combo to 2 to maximise uniqueness
- Use items from ALL available stations — do not ignore any station
- Spread variety across meal periods: Breakfast combos should feel like morning meals, Lunch like midday, Dinner like an evening meal

Each dish must include the station/category it comes from (use the "category" field from the menu data).

Respond with ONLY a JSON object in this exact format, no extra text:
{{
  "Breakfast": [
    {{
      "title": "Combo Name",
      "dishes": [
        {{ "name": "Item 1", "station": "Station Name" }},
        {{ "name": "Item 2", "station": "Station Name" }}
      ],
      "description": "Why this combo is great",
      "approximate_calories": 600,
      "tags": ["high-protein", "vegetarian"]
    }}
  ],
  "Lunch": [
    {{
      "title": "Combo Name",
      "dishes": [
        {{ "name": "Item 1", "station": "Station Name" }},
        {{ "name": "Item 2", "station": "Station Name" }}
      ],
      "description": "Why this combo is great",
      "approximate_calories": 750,
      "tags": ["balanced"]
    }}
  ],
  "Dinner": [
    {{
      "title": "Combo Name",
      "dishes": [
        {{ "name": "Item 1", "station": "Station Name" }},
        {{ "name": "Item 2", "station": "Station Name" }}
      ],
      "description": "Why this combo is great",
      "approximate_calories": 800,
      "tags": ["high-protein"]
    }}
  ]
}}"""

    # Call Claude
    try:
        message = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text: str = message.content[0].text
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Claude API error: {e}")

    # Parse JSON — strip markdown fences if present
    cleaned = raw_text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        combos_raw = json.loads(cleaned)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response: {raw_text}")

    # ── Pydantic validation ──────────────────────────────────────────────────
    print("\n" + "="*60)
    print("  PYDANTIC VALIDATION")
    print("="*60)
    try:
        combos_map = CombosMap(**combos_raw)
        print("  [✓] CombosMap structure valid")
        for period in ("Breakfast", "Lunch", "Dinner"):
            combos_list = getattr(combos_map, period)
            print(f"  [✓] {period}: {len(combos_list)} combos")
            for combo in combos_list:
                print(f"        • \"{combo.title}\" — {len(combo.dishes)} dishes, ~{combo.approximate_calories} cal, tags: {combo.tags}")
    except Exception as e:
        print(f"  [✗] Validation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Invalid AI response structure: {e}")

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
