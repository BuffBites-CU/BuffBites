# BuffBites — API Docs

Authors: Ishita Pawar, Rajvardhan Patil, Sejal Hukare
Base URL: `http://localhost:3001`
Interactive docs: `http://localhost:3001/docs`

---

## Stack

| Layer | Technology |
|---|---|
| Framework | FastAPI (Python) |
| Validation | Pydantic v2 |
| AI Model | `claude-haiku-4-5` (Anthropic) |
| Server | Uvicorn |

---

## Endpoints

### `GET /`

Health check.

```bash
curl http://localhost:3001/
# { "message": "BuffBites API is running" }
```

---

### `GET /api/combos/generate`

Generates 9 AI-powered meal combos for a dining hall and date — 3 each for Breakfast, Lunch, and Dinner.

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `dining` | Yes | One of: `alley`, `c4c`, `libby`, `sewall`, `village_center` |
| `date` | No | `YYYY-MM-DD` — defaults to today |

**Examples:**
```bash
# C4C — specific date
curl "http://localhost:3001/api/combos/generate?dining=c4c&date=2026-03-17"

# Village Center — defaults to today
curl "http://localhost:3001/api/combos/generate?dining=village_center"

# The Alley
curl "http://localhost:3001/api/combos/generate?dining=alley&date=2026-03-17"

# Sewall
curl "http://localhost:3001/api/combos/generate?dining=sewall&date=2026-03-17"

# Libby
curl "http://localhost:3001/api/combos/generate?dining=libby&date=2026-03-17"
```

**Response:**
```json
{
  "dining_location": "Center for Community (C4C)",
  "date": "2026-03-17",
  "day_of_week": "Tuesday",
  "combos": {
    "Breakfast": [
      {
        "title": "The Morning Buff",
        "dishes": [
          { "name": "Scrambled Eggs", "station": "Hot Bar" },
          { "name": "Seasonal Fruit", "station": "Wholesome Field Fruit" }
        ],
        "description": "Light and energizing way to start the day.",
        "approximate_calories": 420,
        "tags": ["vegetarian", "low-carb"]
      },
      { "...combo 2..." },
      { "...combo 3..." }
    ],
    "Lunch": [
      { "...3 combos, same shape..." }
    ],
    "Dinner": [
      { "...3 combos, same shape..." }
    ]
  }
}
```

**Combo object fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Fun, catchy combo name |
| `dishes` | array of `{name, station}` | 2–4 menu items with their station |
| `description` | string | Why this combo works |
| `approximate_calories` | integer | Estimated total calories |
| `tags` | array of string | e.g. `high-protein`, `vegan`, `low-carb` |

**Errors:**

| Status | Reason |
|--------|--------|
| `400` | Invalid or missing `dining` param |
| `404` | No menu found for that dining hall / date |
| `500` | Menu load failure, Claude API error, or hallucinated dishes detected |

**Hallucination error example:**
```json
{
  "detail": {
    "error": "Claude hallucinated dishes not present in today's menu",
    "hallucinated_dishes": [
      {
        "meal_period": "Dinner",
        "combo_title": "The Buff Feast",
        "dish_name": "Mystery Burger",
        "dish_station": "Grill",
        "issue": "dish not found in today's menu"
      }
    ]
  }
}
```

---

## Dining Hall Keys

| Key | Dining Hall |
|-----|-------------|
| `alley` | The Alley at Farrand |
| `c4c` | Center for Community (C4C) |
| `libby` | Libby Dining |
| `sewall` | Sewall Dining |
| `village_center` | Village Center Dining |

---

## Validation

All responses are validated through Pydantic v2 models in `backend/pydantic_models/combo_models.py`:

- **Structure check** — exactly 3 combos per meal period, 2–4 dishes per combo
- **Dish verification** — every dish name is cross-checked against the scraped menu for that day; hallucinated items return a `500`
- **Station auto-correct** — if Claude returns the wrong station for a real dish, it is silently corrected before the response is returned

---

## Menu Item Shape (from scraped JSON)

```json
{
  "name": "Smokey Tofu",
  "category": "Smoke n' Grill",
  "calories": 181,
  "protein_g": 16,
  "is_vegan": true,
  "is_vegetarian": true,
  "allergens": ["Soy"],
  "dietary_labels": ["Vegan"]
}
```
