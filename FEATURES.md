# BuffBites — Feature Roadmap

## Phase 1 — Profile Depth (no new backend collections)
All computed from existing `meal_log`, `karma`, `combos` data already in MongoDB.

- [ ] **Streak tracker** — consecutive days with ≥1 logged meal; shown on profile header
- [ ] **Badges / achievements** — "First Bite" (first log), "Week Streak" (7-day), "Community Star" (10 upvotes received), "Explorer" (ate at 3+ halls), "Power User" (50 karma)
- [ ] **Default dining hall** — store `default_dining_hall` in user profile; home page opens to it automatically
- [ ] **Weekly calorie bar chart** — Mon–Sun bar chart rendered from `meal_log`; shown below Today's Meals

Backend: add `default_dining_hall` field to UserCreate / UserResponse (existing PUT handles save).

---

## Phase 2 — Favorites & Allergy Warnings (light backend)

- [ ] **Favorite AI combos** — heart button on combo cards; store combo snapshot in user profile under `favorites[]`; Favorites section on profile page
- [ ] **Allergy / restriction warning** — cross-check combo dish names against user's `restrictions[]`; show amber banner on card if match found
- [ ] **"Ate it before" hint** — if user previously logged a combo with the same title at the same hall, show "You had this before" badge on card

Backend: add `favorites: list[FavoriteCombo]` to user model + `POST /api/users/{uid}/favorites` and `DELETE /api/users/{uid}/favorites/{index}`.

---

## Phase 3 — Community Enhancements

- [ ] **Search bar** — filter community combos by title, tag, or dish name (frontend only, no backend)
- [ ] **Saved / bookmarked feed tab** — "Saved" tab in community that shows only favorited community combos; reuses favorites from Phase 2
- [ ] **"Rising" tag** — combos created in the last 6 hours with ≥3 upvotes get a ⚡ Rising badge; computed on the frontend from `created_at` + `upvotes`

---

## Phase 4 — Trends Upgrade

- [ ] **Weekly leaderboard tab** — "This Week" tab in Trends; new backend endpoint `GET /api/community/trends/weekly` (no 24h expiry filter)
- [ ] **Hall-specific leaderboard** — the existing multi-hall filter already works; just add a cleaner UI for it (tabs instead of pills)
- [ ] **Share sheet on cards** — native `navigator.share` on every combo card (not just ComboDetail); falls back to clipboard copy

---

## Phase 5 — Comments System (new backend collection)

- [ ] **Comments on community combos** — flat comment thread inside ComboDetail for community type
- Backend: new `comments` MongoDB collection + `routers/comments.py`
  - `POST /api/community/combos/{id}/comments` (auth required)
  - `GET /api/community/combos/{id}/comments`
  - `DELETE /api/community/comments/{id}` (owner only)

---

## Phase 6 — Nutrition Breakdown

- [ ] **Per-dish nutrition in ComboDetail** — look up calories/protein/fat/carbs from scraped menu JSON for each dish in an AI combo
- Backend: new `GET /api/menu/nutrition?dining=c4c&date=2026-06-03&dishes=dish1,dish2` endpoint
- Frontend: nutrition rows in ComboDetail below the dish list

---

## Status

| Phase | Status |
|-------|--------|
| 1 — Profile Depth | ✅ Done |
| 2 — Favorites & Warnings | ✅ Done |
| 3 — Community Enhancements | ✅ Done |
| 4 — Trends Upgrade | ✅ Done |
| 5 — Comments | ✅ Done |
| 6 — Nutrition | ✅ Done |
