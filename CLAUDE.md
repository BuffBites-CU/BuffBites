# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend
```bash
cd backend
source venv/bin/activate

# Dev server (port 8000, auto-reload)
uvicorn main:app --reload

# Run all tests
PYTHONPATH=. venv/bin/pytest tests/ -v

# Run a single test file
PYTHONPATH=. venv/bin/pytest tests/test_combo_models.py -v

# Run a single test by name
PYTHONPATH=. venv/bin/pytest tests/ -v -k "test_verify_combos_hallucinated_dish"
```

### Frontend
```bash
cd frontend

npm run dev      # dev server on :3000
npm run build    # production build
npm run lint     # ESLint
```

## Architecture

### How a combo request flows end-to-end

1. Frontend calls `GET /api/combos/generate?dining=c4c&date=YYYY-MM-DD` (optionally `protein_goal`, `dietary_focus`, `priority_nutrients`, `dietary_preferences`)
2. The endpoint is rate-limited per IP (in-memory sliding window) and checks `combo_cache` (MongoDB, 24h TTL index) keyed by a hash of `(dining, date, goals, dietary prefs)` — a cache hit returns immediately without calling Claude
3. `backend/routers/combos.py` loads the pre-scraped JSON from `scraping_scripts/data/{hall}_dining_menus.json`
4. Every station is classified by keyword into `breakfast | lunch | dinner | dessert | excluded` — utility stations (Condiments, Beverage, Bread, etc.) are dropped entirely; individual component items (sauces, diced toppings) are filtered as a second pass. Items that violate the user's `dietary_preferences` (vegan/vegetarian via flags, gluten-free via allergens, halal via name heuristics) are hard-filtered out of the pool here
5. Classified item pools are sent to `claude-haiku-4-5` via the Anthropic SDK with `client.messages.parse()` (structured output, run in a threadpool since the route is async) — each meal period gets only its relevant items
6. The response is validated by Pydantic v2 models in `backend/pydantic_models/combo_models.py` (structure, combo count, 2–6 dishes per combo)
7. `_build_period()` drops any hallucinated dishes (names not on the scraped menu) and skips combos left with fewer than 2 real dishes; drops are logged to stderr
8. `ComboResponse` JSON is returned and written to `combo_cache`

### Backend structure

`backend/main.py` — FastAPI app, structlog JSON middleware, router registration, `/health` endpoint (pings MongoDB)

`backend/routers/` — one file per domain:
- `combos.py` — combo generation + raw menu endpoint; contains `_classify_station()` and `_is_component_item()` helpers
- `community.py` — community feed CRUD + voting; combos expire after 24h via MongoDB queries
- `users.py` — profile create/read/update
- `drafts.py` — draft save/edit/delete/publish; publishing creates a community combo then deletes the draft

`backend/database.py` — single `AsyncIOMotorClient`; import individual collections directly (`from database import users_collection`)

`backend/auth.py` — Firebase Admin SDK middleware. Reads credentials from `FIREBASE_SERVICE_ACCOUNT_JSON` env var (JSON string, used in production/Docker) or falls back to `serviceAccountKey.json` file (local dev, gitignored). Use `Depends(get_current_user)` on protected routes.

`backend/pydantic_models/` — all Pydantic v2 models; `combo_models.py` contains `verify_combos()` for dish hallucination checking

### Frontend structure

Next.js App Router with TypeScript and Tailwind CSS.

**Single source of truth for types:** `frontend/types/index.ts` — import from `"@/types"` everywhere, never define inline types in components.

**All API calls** go through `frontend/services/api.ts` (`apiFetch<T>`) → never call `fetch()` directly in components. Service files map to backend routers: `combosService.ts`, `communityService.ts`, `usersService.ts`.

**Auth state** lives in `frontend/context/AuthContext.tsx` (Firebase onAuthStateChanged → calls `getUser()` → redirects to `/onboarding` on 404 or `/home` on success). Access via `useAuth()` hook.

**Data hooks:** `useCombos(dining, date)` caches results by `dining+date` key so switching meal period tabs doesn't re-fetch Claude. `useCommunity(mode, dining_hall)` handles optimistic vote updates with rollback.

**Pages and their purpose:**
- `/` — sign-in landing (unauthenticated only)
- `/onboarding` — username + dietary prefs, creates backend user profile
- `/home` — AI combo discovery (DiningSelector → MealPeriodTabs → 3 ComboCards)
- `/community` — community feed with PublishComboModal
- `/trends` — top 20 by upvotes, #1–3 get medal badges
- `/profile` — view/edit username + dietary prefs, sign out

**NavBar** is rendered in `app/layout.tsx` and hidden on `/` and `/onboarding` by checking `usePathname()`.

### Brand colors (Tailwind tokens — never use raw hex in components)

| Token | Hex | Use |
|---|---|---|
| `brand-gold` | `#CFB87C` | Primary buttons, active tabs, badges |
| `brand-black` | `#1C1C1C` | Navs, headings |
| `surface` | `#F9F7F2` | Card/page backgrounds |
| `muted` | `#6B7280` | Secondary text |

Defined in `frontend/tailwind.config.ts` under `theme.extend.colors`.

### Environment variables

**Backend** (`backend/.env`):
- `ANTHROPIC_API_KEY` — required
- `MONGO_URL` — required (MongoDB Atlas connection string)
- `APP_NAME` — optional, defaults to `"combos"` (MongoDB database name)
- `FIREBASE_SERVICE_ACCOUNT_JSON` — production/Docker only (full service account JSON as a string)

**Frontend** (`frontend/.env.local`):
- `NEXT_PUBLIC_API_URL` — FastAPI base URL, defaults to `http://localhost:8000`
- `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`

### Menu data

Pre-scraped JSON files in `scraping_scripts/data/` — one per dining hall, refreshed daily at 8 AM UTC by `.github/workflows/scrape-menus.yml`. Each covers a 6-week rolling window. The backend reads these files directly — there is no separate menu endpoint to MongoDB.

Valid dining hall keys: `alley`, `c4c`, `libby`, `sewall`, `village_center`

### Deployment

Docker build context is `backend/`. See `backend/Dockerfile`, `backend/railway.toml`, `render.yaml` (repo root), and `backend/fly.toml`. Railway requires the service root directory set to `backend/`.
