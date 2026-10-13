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

## Strava data pipeline

```
Student taps Connect ──► consent sheet ──► Strava approve ──► /strava/callback
                                                                   │
                     POST /api/strava/complete (student's token) ◄─┘
                     → tokens encrypted into strava_links

PULL  fuel card / plan ──► strava_client.recent_activities(uid)
                           refresh token if expired → GET /athlete/activities (last 7 days)
                           → trimmed fields, 5-minute memory cache → energy.py

PUSH  Strava ──► POST /api/strava/webhook/<secret> (answered at once, handled in the background)
        activity create/update/delete → drop that student's cached workouts
        athlete authorized=false      → confirm with Strava, then delete the link
```

- **Pull**: `backend/strava_client.py`. Workouts are never written to the
  database.
- **Push**: `backend/routers/strava_webhook.py`. Strava's webhooks aren't
  signed, so the callback URL includes `STRAVA_WEBHOOK_VERIFY_TOKEN`; only Strava
  learns that URL, and any other URL returns 404. A "revoked" event deletes
  data only after a token refresh at Strava fails, and it is checked at most
  once per student every 10 minutes. Activity events only clear the cached
  workouts. Plans are keyed by the day's workouts, so a changed day gets a
  fresh plan.
- **Subscription management**: `backend/scripts/strava_webhook.py`
  (`create`, `view`, `delete`). Strava allows one subscription per app.

## Manual setup checklist

Do these once the code is merged to `main` and deployed. Values in `<...>` are yours.

**1. Strava API app** (needs a Strava subscription since June 2026)
1. Go to <https://www.strava.com/settings/api> and create the app:
   - Name: BuffBites
   - Website: your frontend URL
   - **Authorization Callback Domain:** the bare domain (for example
     `buffbites.vercel.app`), with no `https://` and no path
2. Copy the **Client ID** and **Client Secret**.
3. To let other students connect, raise the athlete limit to 10 in the same
   settings page. New apps only allow your own account.

**2. Generate two secrets locally**
```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"   # STRAVA_TOKEN_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(24))"                                  # STRAVA_WEBHOOK_VERIFY_TOKEN
```
If the first command fails with "No module named cryptography", run
`pip3 install cryptography` first. Keep `STRAVA_TOKEN_KEY` safe and never change
it; changing it disconnects everyone.

**3. Set the backend secrets on Fly** (this restarts the app)
```bash
flyctl secrets set -a buffbites-backend \
  STRAVA_CLIENT_ID=<client id> \
  STRAVA_CLIENT_SECRET=<client secret> \
  STRAVA_REDIRECT_URI=https://<frontend-domain>/strava/callback \
  STRAVA_TOKEN_KEY=<key from step 2> \
  STRAVA_WEBHOOK_VERIFY_TOKEN=<token from step 2>
```

**4. Register the webhook** (once, after step 3 has deployed)
```bash
flyctl ssh console -a buffbites-backend -C "python scripts/strava_webhook.py create"
flyctl ssh console -a buffbites-backend -C "python scripts/strava_webhook.py view"
```
`create` should print a success status and the subscription `id`. Strava
calls `https://buffbites-backend.fly.dev/api/strava/webhook/<verify token>` to
confirm the URL before it answers. If you rotate `STRAVA_WEBHOOK_VERIFY_TOKEN`,
run `delete` and then `create` again.

**5. Check it end to end**
1. Open BuffBites, go to Profile → Training & fuel → Connect, then agree and
   approve on Strava. You should land back on Profile with "Connected as …".
2. The Discover fuel card shows today's workouts.
3. Record or edit an activity on Strava. Within a few seconds the card shows
   the new number after a refresh.
4. Disconnect in Profile, or revoke BuffBites in Strava's settings. The link
   is deleted.

If any step-3 secret is missing, the Profile card says Strava isn't set up, and
the calorie target still works from body stats alone.

**Coming Strava API changes:** a new API host from January 4, 2027, and
`/oauth/deauthorize` replaced by `/oauth/revoke` by June 1, 2027. Both are
constants in `backend/strava_client.py` and `backend/scripts/strava_webhook.py`.

## Cost controls

Building a plan is a paid model call (`COACH_MODEL`, default `claude-opus-5-5`).
The budget card never calls the model. Plan builds require sign-in, are limited
to 4 per minute and `COACH_DAILY_PER_USER` (8) per student per day, and are capped
at `COACH_DAILY_TOTAL` (150) per day for the whole app. Identical requests are
served from the 6-hour cache.
