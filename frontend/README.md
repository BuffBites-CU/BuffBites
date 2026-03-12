# BuffBites

**BuffBites** is an AI-powered food combo discovery app for CU Boulder students. It pulls the dining hall menu from Nutrislice and uses AI to suggest creative, named combos — turning a regular mess hall trip into something worth planning.

---

## What It Does

- Fetches menu from the CU Boulder Nutrislice API 
- Sends available items to Claude AI to generate 5 creative combos per meal period
- Filters combos by dietary needs (vegan, gluten-free, halal) using Nutrislice allergen tags
- Lets students save, rate, and share combos
- Community layer: students can submit their own combos and upvote trending ones

---

## Database Schema (Overview)

- `users` — auth, dietary profile
- `menu_items` — items fetched from Nutrislice (allergens stored as jsonb)
- `combos` — AI-generated or user-submitted combos
- `combo_items` — junction table linking combos to menu items
- `combo_votes` — upvotes/downvotes per user
- `saved_combos` — user bookmarks
- `user_streaks` — gamification: consecutive days eating a balanced combo

---

## Planned Features

### MVP
- Live menu fetch from Nutrislice API
- AI combo generation (breakfast / lunch / dinner aware)
- Dietary filters (vegan, gluten-free, halal)
- Calorie budgeting slider

### v2
- User accounts + saved combos
- Rate combos after trying them
- Dietary profile (set once, auto-filtered forever)

### v3
- Community combo submissions with photos
- Upvote system — trending combos of the week
- Share cards — auto-generated styled image for Instagram (html2canvas)

### v4
- Push notifications / email digest — "Today's top 3 combos"
- Availability alerts by users present at dinings 
- Streak tracker + campus leaderboard
- "Surprise me" button — fully random AI combo on demand

---



