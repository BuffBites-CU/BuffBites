import json
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

    prompt = f"""You are a creative dining combo suggester for CU Boulder's {menu_data['dining_location']} dining hall.

Here are today's available menu items ({day_menu['day_of_week']}, {target_date}):
{json.dumps(all_items, indent=2)}

Generate 9 creative, well-balanced meal combos organized into 3 meal periods: Breakfast, Lunch, and Dinner — with exactly 3 combos each. Each combo should:
- Have a fun, catchy name
- Include 2-4 items, freely mixing items from different stations/categories — cross-station combos are encouraged
- Provide an approximate total calorie count
- Include a short description explaining why it works (taste, nutrition, balance, etc.)
- List relevant tags like "high-protein", "vegan", "low-carb", etc.

Diversity rules — strictly enforce these:
- No dish may appear in more than one combo across the entire response
- The 3 combos within each meal period must each feel noticeably different (different cuisine style, different nutritional focus, different stations)
- Spread variety across meal periods: Breakfast combos should feel like morning meals, Lunch like midday, Dinner like an evening meal

If the menu doesn't have enough items for a specific meal period, create sensible combos using the available items. Assign each combo to the meal period it best suits.

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

    # Validate with Pydantic
    try:
        combos_map = CombosMap(**combos_raw)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Invalid AI response structure: {e}")

    # Build full response object for dish verification
    response = ComboResponse(
        dining_location=menu_data["dining_location"],
        date=target_date,
        day_of_week=day_menu["day_of_week"],
        combos=combos_map,
    )

    # Dish verification — reject hallucinations, auto-correct wrong stations
    errors: list[DishVerificationError] = verify_combos(response, day_menu)

    hallucinated = [e for e in errors if e.issue == "dish not found in today's menu"]
    if hallucinated:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Claude hallucinated dishes not present in today's menu",
                "hallucinated_dishes": [e.model_dump() for e in hallucinated],
            },
        )

    # Auto-correct wrong stations in-place
    station_fixes = [e for e in errors if e.issue.startswith("wrong station")]
    if station_fixes:
        print(f"[WARN] Auto-correcting {len(station_fixes)} station mismatch(es)")
        for fix in station_fixes:
            correct = menu_index[fix.dish_name.strip().lower()]
            for combo in getattr(response.combos, fix.meal_period):
                for dish in combo.dishes:
                    if dish.name == fix.dish_name:
                        dish.station = correct

    return response
