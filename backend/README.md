# BuffBites — Backend

FastAPI backend for BuffBites. Loads daily-scraped CU Boulder dining hall menus, classifies items by meal period, calls Claude to generate 9 named combos, validates the response with Pydantic v2, and cross-checks every dish against the scraped menu.

---

## Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Environment variables

Create a `.env` file in `backend/` with:

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `MONGO_URL` | Yes | MongoDB Atlas connection string |
| `APP_NAME` | No | MongoDB database name (default: `combos`) |
| `PORT` | No | Uvicorn port (default: `3001`) |

Firebase auth uses `backend/serviceAccountKey.json` — obtain it from the Firebase console and place it there. It is gitignored and must never be committed.

---

## Running the server

```bash
venv/bin/uvicorn main:app --reload
```

API available at `http://localhost:8000`.
Interactive Swagger docs at `http://localhost:8000/docs`.

---

## Testing

### Unit tests (no server, no API keys needed)

```bash
cd backend
PYTHONPATH=. venv/bin/pytest tests/ -v
```

80 tests across two files:

| File | What it covers |
|------|---------------|
| `tests/test_combo_models.py` | `Dish` field validation, `Combo.check_dish_count` (0/1/2/6/7 dishes), `verify_combos` — happy path, missing dishes, wrong station, mixed errors, all meal periods, `DishVerificationError` fields |
| `tests/test_station_classifier.py` | `_classify_station` — every keyword set (breakfast/lunch/dinner/dessert), both exclusion paths (keyword and component), `lunch_dinner` fallthrough, priority ordering; `_is_component_item` — every suffix and raw-prep word, real entrees that must pass through |

### Manual API testing

With the server running:

```bash
# Health check
curl http://localhost:8000/

# Raw menu for a dining hall (no Claude call)
curl "http://localhost:8000/api/menu?dining=c4c&date=2026-04-28"

# Generate combos (calls Claude — needs ANTHROPIC_API_KEY)
curl "http://localhost:8000/api/combos/generate?dining=c4c&date=2026-04-28"
```

Valid `dining` values: `alley`, `c4c`, `libby`, `sewall`, `village_center`

### Swagger UI

Open `http://localhost:8000/docs` in a browser — fill in params and run requests without writing curl.

### Structured logs

Every request emits a JSON log line to stdout:

```json
{"method": "GET", "path": "/api/menu", "status": 200, "duration_ms": 14.2, "event": "request", "level": "info", "timestamp": "2026-04-28T19:57:57Z"}
```

Dish verification warnings (hallucinated dishes, wrong station labels) go to stderr and do not affect the response.

---

## Key files

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app — structlog middleware + router registration |
| `routers/combos.py` | Station classifier, item filter, Claude API call, combo enrichment |
| `routers/users.py` | User profile CRUD |
| `routers/community.py` | Community feed — publish, vote, trends |
| `routers/drafts.py` | Draft save / publish flow |
| `pydantic_models/combo_models.py` | `Dish`, `Combo`, `CombosMap`, `ComboResponse`, `verify_combos` |
| `tests/test_combo_models.py` | Unit tests for models and verification |
| `tests/test_station_classifier.py` | Unit tests for classifier functions |

---

## Common failure modes

| Symptom | Cause |
|---------|-------|
| `404 No menu found for ... on ...` | Date not in scraped JSON — data refreshes daily at 8 AM UTC via GitHub Actions |
| `500 Failed to load menu data` | Scraped JSON file missing from `scraping_scripts/data/` |
| `500 Combo generation failed` | Missing or invalid `ANTHROPIC_API_KEY`, or Claude API outage |
| `401` on protected routes | Missing or expired Firebase ID token in `Authorization: Bearer <token>` header |
