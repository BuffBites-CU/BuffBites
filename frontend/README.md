# BuffBites — Frontend

Next.js 14 · TypeScript · Tailwind CSS · Firebase Auth

AI-powered dining hall combo discovery for CU Boulder students.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS |
| Auth | Firebase (Google sign-in) |
| State | React hooks + Context (no external state library needed at this scale) |
| HTTP | Native `fetch` wrapped in `services/api.ts` |

---

## Folder Structure

```
frontend/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout: AuthProvider + NavBar wrapper
│   ├── page.tsx                  # "/" — sign-in landing page
│   ├── onboarding/page.tsx       # "/onboarding" — username + dietary prefs setup
│   ├── home/page.tsx             # "/home" — AI combo discovery
│   ├── community/page.tsx        # "/community" — user-submitted combo feed
│   ├── trends/page.tsx           # "/trends" — top 20 combos today
│   └── profile/page.tsx          # "/profile" — user profile + edit
│
├── components/                   # Shared UI components
│   ├── NavBar.tsx                # Fixed bottom tab bar
│   ├── ComboCard.tsx             # Combo card (used on all 3 feed pages)
│   ├── ComboDetail.tsx           # Bottom sheet with full combo details
│   ├── DiningSelector.tsx        # Horizontal pill row — dining hall picker
│   ├── MealPeriodTabs.tsx        # Breakfast / Lunch / Dinner tab switcher
│   ├── FilterBar.tsx             # Dining hall filter chips (single or multi-select)
│   ├── VoteButtons.tsx           # Upvote / downvote buttons inside ComboDetail
│   └── PublishComboModal.tsx     # 3-step form to submit a community combo
│
├── context/
│   └── AuthContext.tsx           # Firebase auth state + username available app-wide
│
├── hooks/
│   ├── useCombos.ts              # Fetch + cache AI-generated combos
│   └── useCommunity.ts           # Fetch community feed/trends + optimistic voting
│
├── services/                     # All API calls — one file per backend router
│   ├── api.ts                    # Base fetch wrapper with error handling
│   ├── combosService.ts          # /api/combos/*
│   ├── communityService.ts       # /api/community/*
│   └── usersService.ts           # /api/users/*
│
├── types/
│   └── index.ts                  # All TypeScript types — import from "@/types"
│
└── lib/
    └── firebase.ts               # Firebase app init (singleton guard)
```

---

## Environment Variables

Create a `.env.local` file in the `frontend/` directory:

```
NEXT_PUBLIC_API_URL=http://localhost:8000

NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

---

## Full User Flow

### Auth Flow

```
User visits "/"
  └── AuthContext checks Firebase onAuthStateChanged
        ├── loading = true → show full-screen spinner
        ├── No Firebase user → show sign-in page at "/"
        └── Firebase user found
              └── GET /api/users/{firebase_uid}
                    ├── 200 → set username, redirect to /home
                    └── 404 → new user, redirect to /onboarding
```

---

### Onboarding  `/onboarding`

**Who sees it:** New users who signed in with Google but haven't set up a profile yet.

**Step 1 — Username**
- Text input, validated locally (3–20 chars, alphanumeric + underscores)
- Uniqueness checked on submit (backend returns 400 if taken)

**Step 2 — Dietary preferences**
- Multi-select chips: Vegan / Vegetarian / Gluten-Free / Halal
- Optional — user can skip

**On submit:**
```
POST /api/users/
{ firebase_uid, username, email, dietary_preferences }
```
→ On success: save username in AuthContext, redirect to `/home`

---

### Home  `/home`

**Purpose:** Discover AI-generated combos for a dining hall.

**Interactions:**
1. Select dining hall via `DiningSelector` → triggers `GET /api/combos/generate?dining={hall}`
2. Switch meal period via `MealPeriodTabs` → filters already-loaded data, no re-fetch
3. Click a `ComboCard` → `ComboDetail` sheet slides up with full dishes + nutrition

**What the API returns:**
- 3 combos each for Breakfast, Lunch, and Dinner
- Each combo: title, description, dishes (name + station), calories, tags
- Tags are auto-inferred: `vegan`, `vegetarian`, `high-protein`, `light`, `hearty`, `balanced`

**Loading state:** 3 skeleton cards (pulse animation)
**Error state:** Message + "Try again" button

---

### Community  `/community`

**Purpose:** Browse and submit user-created combos. Combos expire after 24 hours.

**Interactions:**
1. `FilterBar` (single-select) filters by dining hall → `GET /api/community/combos?dining_hall=`
2. Click a card → `ComboDetail` with full detail loaded from `GET /api/community/combos/{id}`
3. Inside `ComboDetail`: `VoteButtons` → `POST /api/community/combos/{id}/vote`
   - Optimistic update: count increments immediately, rolls back on error
   - Button disabled after voting (no duplicate prevention on backend yet)
4. "Share Combo" button → `PublishComboModal` (3-step form)

**Publish flow:**
```
Step 1: Dining hall + date
Step 2: Title, description, tags, dishes (name/station/servings), notes
Step 3: Optional photos (max 3, stored as URLs)

POST /api/community/combos?firebase_uid={uid}&username={username}
```
→ On success: close modal, refetch feed

**Expiry display:**
- Each card shows time remaining (e.g. "4h 20m left")
- Turns orange when < 1 hour remains
- Expired combos are automatically excluded by the backend (`expires_at > now`)

---

### Trends  `/trends`

**Purpose:** See the top 20 community combos by upvotes today.

**Interactions:**
1. `FilterBar` (multi-select) — can filter by multiple halls simultaneously
   For multi-select: fetch each hall separately, merge results, re-sort by upvotes
2. Click a card → `ComboDetail` with `VoteButtons`

**Ranking display:**
- #1: gold medal badge + slightly bigger card
- #2: silver medal badge
- #3: bronze medal badge
- #4–20: rank number on left

**Reset behavior:**
- The board resets naturally — combos expire after 24 hours, so the leaderboard is always "today's"
- Header shows: "Resets in Xh Xm" (countdown to midnight)

---

### Profile  `/profile`

**Purpose:** View and edit your account.

**Loads:** `GET /api/users/{firebase_uid}`

**View mode:**
- Google avatar, username, karma score (★ 42 karma)
- Dietary preference chips (color-coded)
- Edit Profile button
- Sign Out button

**Edit mode (inline, no route change):**
- Username input (pre-filled)
- Dietary preference toggles
- Save → `PUT /api/users/{firebase_uid}` with only changed fields
- Cancel → revert all changes

---

## Backend API Reference

| Page | Action | Method | Endpoint |
|------|--------|--------|----------|
| Auth | Check profile exists | `GET` | `/api/users/{firebase_uid}` |
| Onboarding | Create profile | `POST` | `/api/users/` |
| Profile | Load profile | `GET` | `/api/users/{firebase_uid}` |
| Profile | Save edits | `PUT` | `/api/users/{firebase_uid}` |
| Home | Generate AI combos | `GET` | `/api/combos/generate?dining=&date=` |
| Community | Browse feed | `GET` | `/api/community/combos?dining_hall=` |
| Community | Combo detail | `GET` | `/api/community/combos/{id}` |
| Community | Publish combo | `POST` | `/api/community/combos?firebase_uid=&username=` |
| Community | Vote | `POST` | `/api/community/combos/{id}/vote?vote_type=&firebase_uid=` |
| Trends | Top combos | `GET` | `/api/community/trends?dining_hall=` |

---

## Known Gaps (to implement later)

| Gap | Where it matters |
|-----|-----------------|
| No duplicate vote prevention on backend | VoteButtons must disable after first tap using local state |
| Auth passed as query param, not Bearer token | All community + user endpoints — migrate to Authorization header |
| No image storage implemented | PublishComboModal step 3 — needs Firebase Storage or S3 |
| No endpoint for "combos by user" | Profile page — needed to show a user's published combo history |
| AI combos are ephemeral (not stored in DB) | Users must re-publish via PublishComboModal to share an AI combo |
| Trends multi-select requires client-side merge | Backend only accepts one `dining_hall` param — fetch separately and merge |
