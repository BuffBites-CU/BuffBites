# BuffBites — Nutrition Factors & Gen Z Feature Roadmap

Research notes for what to measure, what to show, and what to build next for a CU Boulder student audience. Figures are general public-health guidance (Dietary Guidelines for Americans 2020–2025, FDA Daily Values, sports-nutrition position stands). BuffBites shows estimates, not medical advice. Keep a short disclaimer in the app.

---

## 1. Nutrition factors worth tracking

### Already in the scraped data (Nutrislice)
`calories, fat_g, saturated_fat_g, trans_fat_g, cholesterol_mg, sodium_mg, carbohydrates_g, fiber_g, added_sugar_g, total_sugar_g, protein_g, potassium_mg, calcium_mg, iron_mg, vitamin_d_mcg`, plus allergens and dietary labels (vegan, vegetarian, gluten-free, halal, kosher, locally grown, whole grain).

You can show far more than calories and protein without new scraping.

### What matters most for college students

| Factor | Target (adult, general) | Why it matters for students | How to surface it |
|---|---|---|---|
| **Protein** | 10–35% of kcal; ~0.8 g/kg/day baseline, **1.2–2.0 g/kg/day** if training | Gym culture, club sports, satiety between classes | Fuel Score (shipped), "protein per 100 kcal" sort |
| **Fiber** | **14 g per 1,000 kcal** (~25–34 g/day) | Most students get about half; helps energy and focus | "High-fiber" badge at ≥6 g per combo |
| **Added sugar** | **<10% of kcal** (<50 g/day at 2,000 kcal) | Dessert stations, sweetened drinks, cereal | Warning chip when a combo is >15 g |
| **Sodium** | **<2,300 mg/day** | Dining-hall entrées often hit 1,000+ mg each | Amber chip when a combo is >1,000 mg |
| **Saturated fat** | **<10% of kcal** | Fried and cheesy comfort food | Include in the "Treat meal" logic |
| **Iron** | 18 mg/day (menstruating), 8 mg/day (others) | Iron deficiency is common in young women and plant-based eaters; it causes fatigue | Priority-nutrient filter (backend already accepts `iron`) |
| **Calcium + Vitamin D** | 1,000 mg / 15 mcg per day | Bone density peaks around age 25; Boulder winters mean little sun | Priority nutrients |
| **Potassium** | 2,600–3,400 mg/day | Counterbalances sodium, supports hydration at altitude | Nice-to-have stat |
| **Hydration** | Boulder is at 5,430 ft, and fluid needs rise at altitude | Altitude headaches and fatigue in first-years | Water-reminder nudge, a "Boulder altitude" tip card |

### Better scores to build next
1. **Fuel Score v2.** Compute it from the real per-dish nutrition (`/api/menu/nutrition`) instead of Claude's estimate. Add fiber, added sugar and sodium as ±10-point modifiers.
2. **Protein per dollar or per swipe** for students on block or Munch Money plans.
3. **Plate balance**, MyPlate-style: ½ produce, ¼ protein, ¼ grains, using the station classifier ("Salad bar", "Grill" and so on).
4. **Daily rollup** on Profile: sum the meal log against the user's goals, with streaks for hitting protein or fiber.
5. **Allergen confidence.** Use the scraped `allergens` list per dish instead of the current keyword match on dish names (`getAllergyWarning`). The keyword match misses things like "Alfredo" containing milk.

---

## 2. Features to attract a Gen Z CU Boulder audience

Ranked by impact against effort. ✅ = shipped in this branch.

### Social and identity (highest pull)
- ✅ **Trending posts by student handle.** "@maya.eats's Leg Day Power Bowl" with a podium and a rank.
- **Photo posts (BeReal-style "Bite of the Day").** The `images: string[]` field already exists on combos. Add a 1-tap camera upload (Firebase Storage). Real food photos beat text.
- **Reactions instead of up/down votes.** 🔥 😋 💪 🥲. These are more expressive and less harsh than a downvote.
- **Follow friends + "Who's eating where".** An opt-in "I'm at C4C for lunch" check-in that friends can see. Meeting up is the real job dining halls do.
- **Dorm and hall leaderboards.** Libby vs. Farrand vs. Baker. Tribal competition drives retention.
- **Weekly "Combo Drop" challenge.** A theme each week ("Best under 600 cal", "Best vegan"). The winner gets featured, and ideally CU Dining gives a prize.

### Utility (daily habit)
- **"What's good right now" push at 11:15 and 5:15 MT.** Send the top combo at the user's favorite hall. `PushNotification` / web push works for installed PWAs.
- **Menu alerts.** "Notify me when Smoke n' Grill has brisket." The scraper already has six weeks of future menus, so this is cheap to build.
- **Crowd meter.** Self-reported "how busy?" taps, or time-of-day heuristics.
- **Meal-swipe / Munch Money tracker.** Students constantly worry about running out.
- **Late-night mode.** After 8 PM, surface only what's open (The Alley, grab-and-go).

### Personalization and wellness (keep it positive, not diet-culture)
- **Goal presets in student language:** "Gym gains", "Study fuel", "Budget mode", "Plant-based", "Halal".
- **Streaks and badges.** "5-day protein streak", "Tried every hall", "Veggie Week". Make it collectible, not shaming.
- **Avoid calorie-shaming copy.** Gen Z responds badly to diet culture. Frame food as fuel and variety. Make calorie display a setting you can turn off.

### Shareability (free growth)
- **Story-ready share cards.** Export a 9:16 PNG of a combo or a weekly recap in the poster style for Instagram and TikTok stories.
- **"BuffBites Wrapped"** at the end of each semester: top hall, most-eaten dish, protein total, a personality type ("The C4C Loyalist"). It's built for virality.
- **Referral via QR on dining-hall tables.** Pair it with the poster campaign.

### Campus partnerships
- Work with **CU Dining Services** on official menu access (more reliable than scraping), featured dishes and posters in the halls.
- Partner with **CU Rec Center and club sports** on co-branded "athlete fuel" combos.
- Partner with **Wardenburg Health / registered dietitians** to vet the Fuel Score and lend it credibility.

---

## 3. Suggested next sprint
1. Photo upload on posts (field exists). This gives the most visual upgrade for the feed.
2. Fuel Score v2 from real nutrition, with fiber, sodium and added-sugar chips.
3. Meal-time push notifications for installed PWA users.
4. Story share card export.
5. Hall leaderboards and a weekly challenge.
