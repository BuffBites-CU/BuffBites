# Scraping Scripts

Scrapes CU Boulder dining menus from the Nutrislice API. Each script outputs a JSON file to `data/`. Runs automatically every day via GitHub Actions (`.github/workflows/scrape-menus.yml`).

## Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

---

## Scripts

| Script | Dining Hall | Window | Output |
|--------|------------|--------|--------|
| `c4c_dining.py` | Center for Community (C4C) | 6 weeks | `data/c4c_dining_menus.json` |
| `libby_dining.py` | Libby Dining | 6 weeks | `data/libby_dining_menus.json` |
| `sewall_dining.py` | Sewall Dining Center | 6 weeks | `data/sewall_dining_menus.json` |
| `village_center_dining.py` | Village Center Dining | 6 weeks | `data/village_center_dining_menus.json` |
| `alley_dining.py` | The Alley at Farrand | 4 weeks | `data/alley_dining_menus.json` |

---

## Usage

```bash
python3 c4c_dining.py
python3 libby_dining.py
python3 sewall_dining.py
python3 village_center_dining.py
python3 alley_dining.py
```

---

## Behavior

- `START_DATE` is computed dynamically as **the Monday two weeks before today**, so the scraped window always includes the current week and a few weeks ahead.
- All scripts (except `alley_dining.py`) scan 6 weeks and detect menu repeat cycles, recording the result in `repeat_info`. Repeat detection no longer stops scraping early — the full window is always fetched so today's date is always present in the JSON.
- `alley_dining.py` fetches a fixed 4-week rolling window.
- Empty weeks (holidays, breaks) are skipped in repeat detection.

---

## Output Schema

Each JSON file follows this structure:

```json
{
  "dining_location": "...",
  "url": "...",
  "scrape_start_date": "2026-04-14",
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
