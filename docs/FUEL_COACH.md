# Fuel coach and Strava link

Students can link Strava (opt-in) so their workouts set how much they should eat
today. The fuel coach then builds the rest of the day from their dining hall's menu.

## What the student sees

- **Profile → Training & fuel**: Connect or disconnect Strava, plus optional
  body stats (weight, height, age, sex) in lb/ft or kg/cm.
- **Discover → Fig. 2 · Fuel plan**: today's calorie target, how it's made up
  (daily burn + training ± goal), and protein, carbs and fat. **Build my plan**
  returns meals from the selected hall that add up to the target.

Strava is never contacted until the student ticks the consent box on the
consent sheet and approves on Strava. The server refuses to start a link
without that consent.

## How the numbers are made

All of the math is in `backend/energy.py`. It is plain arithmetic with no AI, and
it is fully tested.

| Step | Method | Source |
| --- | --- | --- |
| Resting burn | Mifflin-St Jeor | Mifflin et al., *Am J Clin Nutr* 1990 |
| Daily movement | BMR × 1.4 (walking around campus) | FAO/WHO activity levels |
| Workouts | Power-meter kJ ≈ kcal; otherwise ACSM running/walking equations from pace and climb; otherwise a sport MET. All are net of resting burn: (MET − 1) × kg × h | ACSM *Guidelines*; 2024 Compendium of Physical Activities |
| Carbs | 3 g/kg (rest) up to 10 g/kg (more than 3 h of training) | ACSM/AND/DC position stand, 2016 |
| Protein | 1.4–1.6 g/kg, 1.8 for muscle gain, 2.0 during a deficit | ISSN protein position stand, 2017 |
| Fat | The remainder, kept at 20–35% of calories | ACSM/AND/DC 2016 |
| Weight loss | −15% (at most 500 kcal), never below 1.2 × BMR | — |

Meals that are already logged count at their logged values. A meal whose time
has passed without a log counts at its usual share of the day (25/35/40%), so a
student who forgot to log lunch isn't told to eat all of it at dinner.

## The agent

`POST /api/coach/plan` (`backend/routers/coach.py`) runs Claude with one tool,
`check_plan`, in the SDK's tool runner:

1. The model drafts meals from the hall's menu (the menu is a cached system block).
2. `check_plan` totals the draft from the scraped nutrition data. It flags
   anything over or under the target, short on protein, missing a meal, not on
   the menu, or against the student's dietary rules or avoid list.
3. The model revises until the check passes (at most 6 turns).
4. The server re-checks the final plan and drops anything that doesn't hold up.
   Every number shown comes from the menu data.

The model receives only sport, start time, minutes, distance, climb and kcal.
It never sees activity names, maps or GPS data.

## Data kept

| What | Where | How long |
| --- | --- | --- |
| Strava tokens (Fernet-encrypted), first name, Strava weight/sex, consent time | `strava_links` | Until disconnect |
| Workouts | Server memory | 5 minutes |
| Built plans | `coach_plans` | 6 hours (TTL index) |
| Body stats | `users.body` (never returned by the public profile endpoint) | Until changed |

Disconnecting revokes access at Strava (`/oauth/deauthorize`) and deletes the
link and cached plans. If a student revokes access on Strava's side, the next
request sees a 401 and deletes the link.

## Setup

1. Create an API application at <https://www.strava.com/settings/api>. Set
   **Authorization Callback Domain** to the frontend's domain (`localhost`
   always works for local development).
2. Generate a token key:
   ```bash
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```
3. Set the backend secrets:
   ```bash
   flyctl secrets set -a buffbites-backend \
     STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=... \
     STRAVA_REDIRECT_URI=https://<frontend-domain>/strava/callback \
     STRAVA_TOKEN_KEY=<key from step 2>
   ```
   If these are unset, the Profile card says Strava isn't set up, and the fuel
   target still works from body stats alone.
4. Keep `STRAVA_TOKEN_KEY` stable. Changing it makes stored tokens unreadable,
   and everyone has to reconnect.

New Strava API apps can link only a small number of athletes until Strava
reviews the app.

## Cost controls

Building a plan is a paid model call (`COACH_MODEL`, default `claude-opus-5-5`).
The budget card never calls the model. Plan builds require sign-in, are limited
to 4 per minute and `COACH_DAILY_PER_USER` (8) per student per day, and are capped
at `COACH_DAILY_TOTAL` (150) per day for the whole app. Identical requests are
served from the 6-hour cache.
