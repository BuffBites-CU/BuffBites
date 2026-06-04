# BuffBites — Hosting & Launch Playbook

## Part 1 — Hosting

### Architecture recap
| Layer | Service | Cost |
|-------|---------|------|
| Backend (FastAPI) | Fly.io | **Free** (3 VMs, 256 MB RAM each) |
| Frontend (Next.js) | Vercel | **Free** tier |
| Database | MongoDB Atlas | **Free** (512 MB) |
| Auth | Firebase | **Free** tier |
| Menu scraping | GitHub Actions | **Free** (2000 min/mo) |

**Total cost: $0/month.** Fly.io's free tier covers 1 always-on VM with no sleep behavior — no cold starts, no idle shutdowns.

> **One gotcha:** Fly.io requires a credit card on file to activate the free tier. They don't charge it unless you exceed free limits, but no card = deployment blocked.

---

### Prerequisites — install flyctl

```bash
# macOS (Homebrew)
brew install flyctl

# or via install script
curl -L https://fly.io/install.sh | sh

# log in / create account
fly auth login
```

---

### Step 1 — Deploy the backend on Fly.io

The `fly.toml` in `backend/` is already configured correctly:
- Region: `den` (Denver — closest to Boulder, CO)
- RAM: 256 MB (free tier max)
- Always-on: `min_machines_running = 1`, `auto_stop_machines = false`
- Health check: `GET /health` every 30s

```bash
cd backend

# Create the app on Fly (first time only) — do NOT deploy yet
fly launch --no-deploy
# When asked for an app name, enter something like: buffbites-api
# When asked to overwrite fly.toml, say: N  (keep the existing one)

# Set all secrets before deploying
fly secrets set ANTHROPIC_API_KEY="sk-ant-..."
fly secrets set MONGO_URL="mongodb+srv://user:pass@cluster.vebxmqn.mongodb.net/?appName=combos"
fly secrets set APP_NAME="combos"
fly secrets set FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"your-project","private_key_id":"...","private_key":"-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n","client_email":"firebase-adminsdk@your-project.iam.gserviceaccount.com","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token"}'

# Deploy
fly deploy
```

After deploying, open `backend/fly.toml` and replace `<app-name>` with the name you chose:
```toml
app = "buffbites-api"
```

Fly gives you a URL like `https://buffbites-api.fly.dev`.

**Subsequent deploys** after code changes:
```bash
cd backend && fly deploy
```

**Useful commands:**
```bash
fly logs          # stream live logs
fly status        # machine health + version
fly ssh console   # SSH into the running container
fly secrets list  # verify secrets are set (values hidden)
```

---

### Step 2 — Deploy the frontend on Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → import GitHub repo
2. Set **Root Directory** to `frontend/`
3. Add environment variables in the Vercel dashboard:
   ```
   NEXT_PUBLIC_API_URL=https://buffbites-api.fly.dev
   NEXT_PUBLIC_FIREBASE_API_KEY=
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=
   NEXT_PUBLIC_FIREBASE_APP_ID=
   ```
4. Click Deploy — Vercel gives you `https://buffbites.vercel.app`

**Custom domain** (optional, ~$10/yr):
- Buy `buffbites.app` or `buffbites.co` on Namecheap / Cloudflare Registrar
- Add in Vercel → Project → Settings → Domains

---

### Step 3 — MongoDB Atlas network access

Fly.io outbound IPs change on each deploy, so the simplest approach:

MongoDB Atlas → Network Access → Add IP Address → **Allow Access from Anywhere** (`0.0.0.0/0`)

For tighter security later: buy a Fly dedicated IPv4 ($2/mo) with `fly ips allocate-v4`, then allowlist that single IP in Atlas.

---

### Step 4 — Firebase authorized domains

Firebase Console → Authentication → Settings → Authorized Domains → Add:
- `buffbites.vercel.app`
- Your custom domain if you have one

---

### Step 5 — Verify the full stack

```bash
# Backend health
curl https://buffbites-api.fly.dev/health
# Expected: {"status":"ok","db":"ok"}

# Combo generation (replace date with today)
curl "https://buffbites-api.fly.dev/api/combos/generate?dining=c4c&date=2026-06-04"

# Open the frontend
open https://buffbites.vercel.app
```

---

### Step 6 — Daily menu scraper (already automated)

The GitHub Actions workflow (`.github/workflows/scrape-menus.yml`) runs at 8 AM UTC daily and commits fresh JSON. No extra setup needed — it uses the auto-provided `GITHUB_TOKEN`.

---

### Free tier limits

| Resource | Fly.io free allowance | BuffBites usage (est.) |
|----------|-----------------------|------------------------|
| Shared VMs | 3 × `shared-cpu-1x` | Uses 1 |
| RAM | 256 MB per VM | ~80–120 MB at idle |
| Outbound transfer | 160 GB/mo | ~1–2 GB/mo at low traffic |

You'd need ~80k API requests/month before hitting transfer limits — well beyond a campus app's scale.

Monitor usage:
```bash
fly status
```
Or check the Fly.io dashboard at fly.io/dashboard → billing shows $0.00 in real time until you exceed free limits.

---

## Part 2 — Marketing

### Target audience
CU Boulder students. ~36,000 enrolled. Heavy Reddit users. Dining halls serve ~8,000 meals/day.

---

### Channel 1 — Reddit (highest ROI)

**Subreddits to post in:**

| Subreddit | Subscribers | Angle |
|-----------|-------------|-------|
| r/CUBoulder | 47k | Primary — direct audience |
| r/boulder | 90k | Local interest |
| r/college | 800k | "Built an AI dining app for my school" |
| r/webdev | 800k | Technical build post |
| r/SideProject | 220k | Side project showcase |
| r/InternetIsBeautiful | 18M | If UI looks great |

**Post templates:**

*r/CUBoulder — direct launch post:*
```
Title: I built an AI app that suggests meal combos for CU dining halls — BuffBites

Hey Buffs 🦬

Sick of staring at the dining hall menu trying to figure out what to eat?
I built BuffBites — it uses Claude AI to generate meal combo suggestions
for all 5 CU dining halls based on today's actual menu.

Features:
- AI-crafted combos for C4C, Sewall, Libby, Alley, Village Center
- Community feed — share your own combos and upvote others
- Calorie tracking — log what you ate, set a daily goal
- Trending today leaderboard

It's free, just sign in with your Google account.

Link: buffbites.vercel.app

Would love feedback — what would make this actually useful for your dining routine?
```

*r/SideProject / r/webdev — technical post:*
```
Title: Built an AI dining combo suggester for my university — stack + lessons learned

[screenshot of the app]

Been working on BuffBites for the past month. It generates meal combo
suggestions for CU Boulder dining halls using Claude Haiku + daily-scraped
menu data.

Stack: Next.js + FastAPI + MongoDB + Firebase + Anthropic API
Interesting parts:
- Daily GitHub Actions job scrapes 5 dining halls and commits JSON
- Claude does structured output with Pydantic validation
- Dish hallucination checker cross-references every AI suggestion

The combo generation pipeline was the fun part — had to classify stations,
filter condiments, and prompt Claude to mix items across stations.

GitHub: [link if you want to open source it]
Live: buffbites.vercel.app
```

**Reddit posting rules:**
- Post between 9 AM – 12 PM MT on Tuesday/Wednesday (highest engagement)
- Reply to every comment in the first 2 hours — boosts Reddit's ranking algorithm
- Don't post the same content to multiple subreddits on the same day
- Flair as "Project" or "Resource" where available
- Add a screenshot or short screen recording — posts with images get 3× more clicks

---

### Channel 2 — Campus channels

**Discord servers:**
- CU Boulder student Discord (search "CU Boulder Discord" — there are several large ones)
- CS/Engineering department Discord
- Post in `#resources` or `#tools` channels

**Instagram / TikTok:**
- Short screen recording showing AI combo generation → "POV: you let AI pick your lunch at C4C"
- Tag @cuboulder in comments, use #cuboulder #collegefood #ai

**Physical posters:**
- QR code → buffbites.vercel.app
- Post near dining hall entrances, dorms, the UMC
- "AI picks your next meal. Free. Try it →" with a QR code is enough

**Email:**
- If you're in any clubs with listservs (CS club, Pre-med, athletes), send one email
- Subject: "Built a free AI dining tool for CU — try it?"

---

### Channel 3 — Product Hunt

When the app is polished, launch on Product Hunt.

1. Create an account at producthunt.com
2. Find a hunter with followers to submit it (or submit yourself)
3. Launch on a Tuesday or Wednesday
4. Prepare:
   - 3–5 screenshots
   - 60-second demo video (Loom or screen recording)
   - Tagline: "AI-crafted meal combos for CU Boulder dining halls"
5. Tell everyone to upvote the day of launch — timing matters

---

### Channel 4 — Growth loops inside the app

These are built into the product already:

- **Share sheet** on combo cards — sends a native share dialog
- **"Post to Community"** button — creates viral community content
- **Trending leaderboard** — top contributors get karma and recognition

**To add:**
- Referral link: `buffbites.vercel.app?ref=username` — shows "invited by @username" on sign-up
- "Share your streak" card — shareable image of your meal streak (react-dom/server → OG image)

---

### Channel 5 — CU official channels

- **CU Boulder Buff Bulletin** (student newspaper) — pitch a "student-built tool" story
- **CU app store submissions** — contact CU IT about listing in the campus app portal
- **Housing & Dining** — email dining@colorado.edu; they sometimes share student tools

---

## Part 3 — Launch Checklist

### Before you post anywhere:
- [ ] `fly deploy` succeeds and `curl https://buffbites-api.fly.dev/health` returns `{"status":"ok","db":"ok"}`
- [ ] App loads on mobile without errors
- [ ] Google sign-in works on the production Vercel URL
- [ ] At least one dining hall generates combos correctly
- [ ] MongoDB Atlas IP allowlist is open (`0.0.0.0/0`)
- [ ] Firebase authorized domains includes the Vercel URL
- [ ] Privacy policy page exists (Firebase requires it for OAuth apps)

### Week 1 goal:
- 50 sign-ups from CU Boulder students
- 1 Reddit post with > 20 upvotes in r/CUBoulder
- 5 community combos published

### Metrics to track (free):
- Vercel Analytics (built-in, enable in dashboard)
- MongoDB Atlas Charts for user/combo growth
- Firebase Analytics for auth events
- `fly logs` for backend errors

---

## Part 4 — Privacy Policy (required for Firebase OAuth)

Firebase requires a privacy policy URL for Google sign-in in production.

Minimum content:
```
BuffBites Privacy Policy

We collect: your Google email address and display name (via Google sign-in).
We store: your username, dietary preferences, and meal logs in MongoDB Atlas.
We do not sell your data.
You can delete your account by contacting [your email].
```

Host it at `/privacy` in your Next.js app or on a free page at notion.so.
Add the URL in Firebase Console → Authentication → Settings → Privacy Policy URL.
