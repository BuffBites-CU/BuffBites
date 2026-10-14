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

All the scraping logic lives in `nutrislice.py`, and every hall's school, menu slugs, output file and closed flag live in `halls.py`. Each `<hall>_dining.py` is a thin entry point (one workflow step per hall). `validate_menus.py` and `build_live_menus.py` read the hall list from `halls.py`, so adding a hall takes an entry there, a `<hall>_dining.py`, a workflow step and an entry in `backend/menu_store.py` (`DINING_FILES`, plus `CLOSED_HALLS` if it is closed).

| Script | Dining Hall | Window | Output |
|--------|------------|--------|--------|
| `c4c_dining.py` | Center for Community (C4C) | 6 weeks | `data/c4c_dining_menus.json` |
| `libby_dining.py` | Libby Dining | 6 weeks | `data/libby_dining_menus.json` |
| `sewall_dining.py` | Sewall Dining Center | 6 weeks | `data/sewall_dining_menus.json` |
| `village_center_dining.py` | Village Center Dining | 6 weeks | `data/village_center_dining_menus.json` |
| `alley_dining.py` | The Alley at Farrand (closed for remodel until Aug 2028; empty scrapes are expected) | 6 weeks | `data/alley_dining_menus.json` |
| `seec_dining.py` | SEEC Cafe (student order-ahead) | 6 weeks | `data/seec_dining_menus.json` |

---

## Usage

```bash
python3 c4c_dining.py
python3 libby_dining.py
python3 sewall_dining.py
python3 village_center_dining.py
python3 alley_dining.py
python3 seec_dining.py
python3 -m pytest .     # guard, merger, validator and live-copy tests (CI runs these before scraping)
```

---

## Behavior

- The window starts on **the Monday two weeks before today** (Mountain time, `nutrislice.start_date`), so the scraped window always includes the current week and a few weeks ahead.
- Every hall scans 6 weeks. Halls with several menu types (C4C stations, Village Center stations) are merged by date; a station header that two menus share (e.g. "Featured Entree") keeps both menus' dishes, and a dish name appears once per station.
- Days with no menu (weekends at Libby and Sewall, breaks) are left out of the JSON.
- All halls except The Alley detect menu repeat cycles and record the result in `repeat_info`. The full window is always fetched. Empty weeks (holidays, breaks) are skipped in repeat detection. `alley_dining.py` also discovers the hall's menu types from the Nutrislice schools index, since it is expected to reopen under a new slug.
- Requests retry connection errors, 429 and 5xx with backoff. If a week still fails, the previous file's days for that week are kept instead of dropped, the file is saved, and the script exits 1 so the workflow run turns red.
- `menu_guard.py` keeps the previous file (and exits 1) when a scrape has no items, has nothing from today on while the old file did, or had failed requests and covers fewer upcoming days than the old file.

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
