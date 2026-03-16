# BuffBites — API Docs

Authors: Ishita Pawar, Rajvardhan Patil, Sejal Hukare
Base URL: `http://localhost:3001`

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

Generates 4 AI-powered meal combos for a dining hall and date.

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `dining` | Yes | One of: `alley`, `c4c`, `libby`, `sewall`, `village_center` |
| `date` | No | `YYYY-MM-DD` — defaults to today |

**Example:**
```bash
curl "http://localhost:3001/api/combos/generate?dining=c4c&date=2026-03-16"
```

**Response:**
```json
{
  "dining_location": "Center for Community (C4C)",
  "date": "2026-03-16",
  "day_of_week": "Monday",
  "combos": [
    {
      "title": "The Golden Buff",
      "dishes": ["Grilled Chicken", "Brown Rice", "Roasted Broccoli"],
      "description": "High-protein post-gym meal",
      "approximate_calories": 720,
      "tags": ["high-protein", "halal"]
    }
  ]
}
```

**Errors:**

| Status | Reason |
|--------|--------|
| 400 | Invalid or missing `dining` param |
| 404 | No menu found for that date |
| 500 | Failed to load menu data or Claude API error |

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

## Menu Item Shape (from scraped JSON)

```json
{
  "name": "Grilled Chicken",
  "category": "Featured Entree",
  "calories": 320,
  "protein_g": 42,
  "is_vegan": false,
  "is_vegetarian": false,
  "allergens": ["Wheat", "Soy"],
  "dietary_labels": ["Halal"]
}
```
