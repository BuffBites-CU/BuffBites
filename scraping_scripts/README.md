# Scraping Scripts

Scrapes CU Boulder dining menus from the Nutrislice API. Each script outputs a JSON file in the same directory.

## Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

---

## Scripts

| Script | Dining Hall | Menu Cycle | Output |
|--------|------------|------------|--------|
| `c4c_dining.py` | Center for Community (C4C) | — | `c4c_dining_menus.json` |
| `libby_dining.py` | Libby Dining | 2-week repeat | `libby_dining_menus.json` |
| `sewall_dining.py` | Sewall Dining Center | 3-week repeat | `sewall_dining_menus.json` |
| `village_center_dining.py` | Village Center Dining | — | `village_center_dining_menus.json` |
| `alley_dining.py` | The Alley at Farrand | — | `alley_dining_menus.json` |

---

## Usage

```bash
venv/bin/python3 c4c_dining.py
venv/bin/python3 libby_dining.py
venv/bin/python3 sewall_dining.py
venv/bin/python3 village_center_dining.py
venv/bin/python3 alley_dining.py
```

---

## Behavior

- All scripts (except `alley_dining.py`) start from **Jan 5, 2026** and stop automatically when a week's menu fingerprint matches a previously seen week — reporting the repeat cycle length.
- `alley_dining.py` fetches a fixed 3-week window starting from `START_DATE`.
- Empty weeks (holidays, breaks) are skipped in repeat detection.

---

## Output Schema

Each JSON file follows this structure:

```json
{
  "dining_location": "...",
  "url": "...",
  "scrape_start_date": "2026-01-05",
  "repeat_info": {
    "first_seen_week": 2,
    "first_seen_start": "2026-01-12",
    "repeat_week": 4,
    "repeat_start": "2026-01-26",
    "gap_weeks": 2
  },
  "menus": [
    {
      "date": "2026-01-12",
      "day_of_week": "Monday",
      "categories": {
        "Grill": [
          {
            "name": "Cheeseburger",
            "description": "",
            "serving_size": "1 each",
            "calories": 520,
            "ingredients": "...",
            "allergens": ["wheat", "milk"],
            "dietary_labels": ["halal"],
            "is_vegan": false,
            "is_vegetarian": false,
            "nutrition": {
              "calories": 520,
              "fat_g": 28,
              "protein_g": 30,
              "sodium_mg": 740
            }
          }
        ]
      }
    }
  ]
}
```
