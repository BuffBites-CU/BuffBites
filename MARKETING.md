# BuffBites — Marketing Playbook

---

## The One-Liner

> *"Free AI app that generates meal combos for CU Boulder dining halls based on today's actual menu — set your dietary goals and the AI adjusts."*

Keep this consistent everywhere: Reddit bios, Instagram captions, Discord messages, posters.

---

## Part 1 — Reddit Strategy

### Rules
- Post **Tuesday or Wednesday, 9–11 AM Mountain Time** — highest CU engagement window
- Reply to **every comment within the first 2 hours** — Reddit's algorithm rewards early engagement velocity
- Use **image posts** (screenshot of the app) — get 3× more clicks than text-only posts
- Never post the same link to multiple subreddits on the same day — spread posts over 1–2 weeks
- Flair posts as "Resource" or "Project" where available

---

### Post 1 — r/CUBoulder
**Do this first. Highest ROI.**

**Title:**
```
I built a free AI app that tells you what to eat at CU dining halls
```

**Body:**
```
Hey Buffs 🦬

I'm a student here and got tired of standing in front of the C4C menu
for 10 minutes trying to figure out what to eat.

So I built BuffBites — it uses AI to generate meal combos for all 5 CU
dining halls based on the actual menu that day.

What it does:
- Generates 3 combo suggestions for Breakfast, Lunch, and Dinner
- Works for C4C, Sewall, Libby, The Alley, and Village Center
- Community feed where students share their own combos and upvote them
- Calorie + protein tracking when you log what you ate
- Set dietary goals (high protein, low carb, vegan, etc.) and combos adjust

It's completely free, just sign in with your CU Google account.

Link: buff-bites.vercel.app

Would genuinely love feedback — what would make this actually useful
for your daily dining routine?
```

**Attach:** screenshot of combo cards for C4C showing today's menu.

---

### Post 2 — r/boulder
**1–2 days after Post 1.**

**Title:**
```
CU student built a free AI dining tool for campus dining halls
```

**Body:**
```
My roommate and I kept arguing over where to eat on campus so I spent
a few weeks building BuffBites.

It pulls the actual daily menu from all 5 CU dining halls, runs it
through AI, and spits out meal combo suggestions tailored to your
dietary goals.

Useful if you're a student, staff, or just someone who eats at CU dining.

buff-bites.vercel.app — free, no ads
```

---

### Post 3 — r/SideProject
**3–4 days after Post 1.**

**Title:**
```
Built an AI meal combo app for my university's dining halls — here's the stack
```

**Body:**
```
Been lurking here for a while, finally built something worth sharing.

BuffBites generates meal combo suggestions for CU Boulder's 5 dining
halls using the actual daily menu.

Stack:
- Next.js 15 (App Router) + Tailwind
- FastAPI + Python on Fly.io
- MongoDB Atlas
- Firebase Auth (Google sign-in)
- Anthropic Claude Haiku for combo generation
- GitHub Actions scrapes 5 dining halls daily and commits JSON

The interesting part: I had to build a station classifier to split
menu items into breakfast/lunch/dinner/dessert pools before sending
them to Claude, and a hallucination checker that cross-references
every AI-generated dish name against the scraped menu.

Also built cross-station logic so Claude is forced to mix items
from different stations (grill + salad bar + pasta bar) instead
of just picking from one station.

Live: buff-bites.vercel.app
Happy to answer questions about the architecture.
```

---

### Post 4 — r/webdev
**Same week as Post 3, different day.**

**Title:**
```
How I forced an LLM to stop hallucinating menu items — building a dining hall AI app
```

**Body:**
```
Built BuffBites, an AI meal combo generator for CU Boulder dining halls.
The hard part wasn't the AI — it was making the AI trustworthy.

Problem: Claude would sometimes suggest dishes that weren't actually
on the menu that day. Classic hallucination.

Solution I built:
1. Daily GitHub Actions job scrapes 5 dining halls via Nutrislice API
2. Builds a name-indexed lookup of every real menu item
3. After Claude generates combos, every dish name is cross-checked
   against the lookup (case-insensitive)
4. Mismatches are logged to stderr as warnings
5. Structured output (Pydantic v2 + Claude's native JSON mode)
   enforces dish count (2–6 per combo) at the schema level

Stack: Next.js + FastAPI + MongoDB + Claude Haiku
Live: buff-bites.vercel.app

What other approaches have people used for grounding LLM outputs
against real data?
```

---

### Post 5 — r/college
**1 week after launch.**

**Title:**
```
Built a free AI dining hall app for my school — other universities could use this too
```

**Body:**
```
Hey r/college — I'm a CU Boulder student and built BuffBites,
an AI that suggests meal combos based on your actual dining hall
menu each day.

Currently only works for CU Boulder's 5 dining halls (I had to
write custom scrapers for each one) but the architecture could
support any school that uses Nutrislice for their menus — which
is a lot of schools.

If this gets traction I'd be interested in expanding it.

buff-bites.vercel.app — free, sign in with Google
```

---

### Subreddit Priority

| Subreddit | Subscribers | When | Angle |
|-----------|-------------|------|-------|
| r/CUBoulder | 47k | Day 1 | Direct audience — best ROI |
| r/boulder | 90k | Day 2–3 | Local community |
| r/SideProject | 220k | Day 4–5 | Side project showcase |
| r/webdev | 800k | Day 5–6 | Technical build post |
| r/college | 800k | Week 2 | Expand beyond CU |
| r/InternetIsBeautiful | 18M | If UI gets polished | Mass reach |

---

## Part 2 — Campus Channels

### Discord
Post in CU Boulder student servers (`#resources`, `#off-topic`, or `#tools`):
```
hey built a free app that uses AI to suggest what to eat at CU
dining halls based on today's actual menu — buff-bites.vercel.app
```

Find servers by searching "CU Boulder Discord" — there are several large ones.

### Instagram / TikTok
Record a 30-second screen recording:
- Open the app → select C4C → watch combos generate
- Caption: *"POV: you let AI pick your lunch at C4C 🦬"*
- Tag `@cuboulder`
- Hashtags: `#cuboulder #collegefood #ai #buffs #cubolderlife`

### Physical QR Code Posters
Print and post near dining hall entrances, dorm lobbies, and the UMC:

```
┌─────────────────────────────┐
│                             │
│   Tired of menu paralysis?  │
│   AI picks your meal.       │
│   Free.                     │
│                             │
│        [QR CODE]            │
│                             │
│   buff-bites.vercel.app     │
│                             │
└─────────────────────────────┘
```

Generate QR code at qr-code-generator.com pointing to `buff-bites.vercel.app`.

### Email Lists
If you're in any clubs with listservs (CS club, pre-med, athletics, dorm councils):
- **Subject:** `Built a free AI dining tool for CU — try it?`
- **Body:** 3 sentences max — what it does, the link, one ask for feedback

### CU Official Channels
- **CU Boulder Buff Bulletin** (student newspaper) — pitch a "student-built" story
- **Housing & Dining** — email `dining@colorado.edu` — they sometimes share student tools
- **CU IT / app portal** — contact about listing in the campus app directory

---

## Part 3 — Content Calendar

| Day | Action |
|-----|--------|
| Day 1 (Tue/Wed) | Post to r/CUBoulder with screenshot |
| Day 2 | Reply to all comments. Post to r/boulder |
| Day 3 | Post QR code posters near dining halls |
| Day 4 | Post to Discord servers |
| Day 5 | Post to r/SideProject |
| Day 6 | Post to r/webdev |
| Day 7 | Post Instagram/TikTok screen recording |
| Week 2 | Post to r/college |
| Week 3 | Reach out to Buff Bulletin |

---

## Part 4 — Growth Loops (Already in the App)

These drive organic sharing without any extra work:

| Feature | How it spreads |
|---------|---------------|
| "Post to Community" button | Every AI combo can be 1-tap shared to the community feed |
| Trending leaderboard | Top contributors get karma + recognition — incentivizes sharing |
| Share sheet on combo cards | Native OS share dialog — easy to text to a friend |
| ⚡ Rising tag | New combos getting traction get a badge — creates urgency |

**To add later:**
- Referral link `buff-bites.vercel.app?ref=username` — shows "invited by @username" on sign-up
- Shareable streak card — image of your meal streak to post on Instagram Stories

---

## Part 5 — Metrics to Watch

| Metric | Where | Goal (Week 1) |
|--------|-------|---------------|
| Sign-ups | Firebase Console → Authentication | 50 users |
| DAU | Vercel Analytics | 20+ |
| Combos generated | MongoDB Atlas Charts | 100+ |
| Community combos posted | MongoDB Atlas Charts | 10+ |
| Reddit upvotes | r/CUBoulder post | 20+ |

---

## Part 6 — Response Templates

When people ask questions in Reddit comments:

**"Does it work for [other school]?"**
```
Not yet — I built custom scrapers for CU's 5 halls. If your school
uses Nutrislice for menus it would be pretty straightforward to add.
DM me if you're interested.
```

**"Is the data accurate?"**
```
Yes — it scrapes the actual Nutrislice menu every morning at 8 AM UTC
via GitHub Actions, so it's always today's real menu. There's also a
hallucination checker that verifies every AI-suggested dish exists
on the actual menu before it's shown to you.
```

**"Will you add more dining halls / schools?"**
```
That's the plan if there's demand. Right now it's all 5 CU Boulder
halls. If you want your school added, let me know — it's doable.
```

**"Is it free?"**
```
Completely free, no ads, no paywall. Just sign in with your Google
account and start using it.
```
