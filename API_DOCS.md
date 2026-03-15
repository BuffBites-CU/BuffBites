# BuffBites — API Documentation

This document is the single source of truth for data structures and API endpoints.
All three team members should refer to this when building their respective components.

---

## Data Models

### Menu
Represents one day's menu for a single dining hall. Populated by the scraper.

```json
{
  "dining_location": "The Alley at Farrand",
  "date": "2026-03-15",
  "day_of_week": "Sunday",
  "categories": {
    "Featured Entree": [
      {
        "name": "Grilled Chicken",
        "description": "",
        "serving_size": "6 oz",
        "calories": 320,
        "ingredients": "Chicken breast, olive oil, salt, pepper...",
        "allergens": ["Wheat", "Soy"],
        "dietary_labels": ["Halal"],
        "is_vegan": false,
        "is_vegetarian": false,
        "nutrition": {
          "calories": 320,
          "fat_g": 8,
          "saturated_fat_g": 2,
          "sodium_mg": 480,
          "carbohydrates_g": 0,
          "fiber_g": 0,
          "protein_g": 42
        }
      }
    ],
    "Salad Bar": [
      {
        "name": "Mixed Greens",
        "calories": 20,
        "allergens": [],
        "dietary_labels": ["Vegan", "Gluten-Free"],
        "is_vegan": true,
        "is_vegetarian": true
      }
    ]
  }
}
```

---

### Combo
Represents a meal combination — either AI-generated or user-submitted.

```json
{
  "title": "The Golden Buff",
  "dishes": ["Grilled Chicken", "Brown Rice", "Roasted Broccoli"],
  "tags": ["halal", "gluten-free"],
  "upvotes": 24,
  "downvotes": 1,
  "description": "Perfect post-gym meal under 700 calories"
}
```

> ⚠️ Important for frontend: use `title` not `name`, and `dishes` not `items`

---

### User
Represents a registered user.

```json
{
  "username": "buffs_eat",
  "email": "buffs_eat@colorado.edu",
  "karma": 142
}
```

> ⚠️ Password is never returned from the API — it is stored as a hash server-side only

---

## API Endpoints

Base URL: `http://localhost:8000`

---

### Menus

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/menus` | Get all menus |
| GET | `/menus?dining_hall=alley&date=2026-03-15` | Get menu for a specific dining hall and date |
| POST | `/menus` | Add a new menu (used by scraper only) |

**Example GET /menus response:**
```json
[
  {
    "dining_location": "The Alley at Farrand",
    "date": "2026-03-15",
    "day_of_week": "Sunday",
    "categories": { ... }
  }
]
```

---

### Combos

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/combos` | Get all community combos |
| GET | `/combos/ai?period=lunch&date=2026-03-15` | Get AI-generated combos for a meal period |
| POST | `/combos` | Submit a new combo |
| POST | `/combos/:id/vote` | Upvote or downvote a combo |

**Example POST /combos request body:**
```json
{
  "title": "Midnight Munchies",
  "dishes": ["Mac & Cheese", "Garlic Bread", "Lemonade"],
  "tags": ["vegetarian"],
  "description": "Late night comfort food"
}
```

**Example POST /combos/:id/vote request body:**
```json
{
  "type": "upvote"
}
```

---

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/users/register` | Register a new user |
| POST | `/users/login` | Log in and receive a token |
| GET | `/users/:id` | Get a user's profile |

---

## Dining Hall Reference

| Dining Hall | Key to use in API |
|---|---|
| The Alley at Farrand | `alley` |
| Center for Community (C4C) | `c4c` |
| Libby Dining | `libby` |
| Sewall Dining | `sewall` |
| Village Center Dining | `village` |

---

## Notes for Each Team Member

**Scraper:** POST scraped data to `POST /menus` once the backend is running. Make sure `dining_location` matches the reference table above exactly.

**Backend:** All endpoints return JSON. Errors return `{ "error": "message" }` with the appropriate status code.

**Frontend:** Use `title` and `dishes` for combo fields. Dietary filter values should match exactly: `vegan`, `vegetarian`, `gluten-free`, `halal`.
