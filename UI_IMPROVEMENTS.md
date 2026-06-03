# Buff Bites — UI/UX Improvement Plan

> **Scope:** Visual polish, interaction quality, and missing UX flows. No backend schema changes unless noted.

---

## 1. Design System Tightening

### 1.1 Typography Scale
The app currently uses unstyled `font-sans` (Inter) without a consistent type scale. Define and enforce a scale in `tailwind.config.ts`:

| Role | Class | Size / Weight |
|---|---|---|
| Page title | `text-title` | 22px / 700 |
| Section heading | `text-heading` | 17px / 600 |
| Body | `text-body` | 15px / 400 |
| Caption | `text-caption` | 12px / 400, `muted` |
| Label | `text-label` | 11px / 600, uppercase, letter-spacing |

Apply these tokens everywhere instead of ad-hoc `text-xl font-semibold` combos.

### 1.2 Spacing & Surface Tokens
Add to `tailwind.config.ts`:
```ts
surface: {
  DEFAULT: '#F9F7F2',
  card: '#FFFFFF',       // cards lifted off surface
  overlay: '#F0EDE6',    // input backgrounds, pressed states
}
```
Cards should use `bg-surface-card` with `shadow-sm` so they visually lift off the `surface` page background. Right now cards and page share the same off-white, making the hierarchy flat.

### 1.3 Brand Gold Usage
`brand-gold` is currently used for almost everything active. Differentiate:
- **Filled gold** (`bg-brand-gold text-brand-black`) → primary CTAs only (Generate, Publish, Save)
- **Gold outline** (`border-brand-gold text-brand-gold`) → secondary actions (Refresh, filters)
- **Gold underline** → active nav/tab indicators
- Never use `brand-gold` as text on white (low contrast); use `brand-black` or `muted` for readable text

### 1.4 Consistent Border Radius
App mixes `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-full` inconsistently. Standardize:
- Cards → `rounded-2xl`
- Buttons → `rounded-xl`
- Tags/chips → `rounded-full`
- Inputs → `rounded-xl`
- Bottom sheet → `rounded-t-3xl`

---

## 2. Navigation

### 2.1 Bottom NavBar — Pill Active Indicator
Replace the gold icon-only approach with a pill background on the active tab:
```
[ ✦ Discover ]   Community   Trends   Profile
  ^^^^^^^^^^^^
  bg-brand-gold/15, text-brand-gold, rounded-xl
```
Label always visible (already is), but inactive tabs get `text-muted` instead of `text-gray-400` for consistency.

### 2.2 Page Transition Animation
Add a simple `translateY(4px) → 0` + `opacity: 0 → 1` fade-up on page entry. Next.js App Router makes this easy with a shared layout motion wrapper (`framer-motion` or CSS `@keyframes`). Makes navigation feel native rather than instant-swap.

### 2.3 Back Navigation on Modals
`ComboDetail` and `PublishComboModal` currently close only by backdrop click or X button. Add browser back-button support by pushing a hash to the URL on open and popping it on close (`window.history.pushState` / `popstate` listener). Users naturally swipe back on mobile.

---

## 3. Home Page (`/home`)

### 3.1 Skeleton → Content Transition
Current skeletons are plain gray rectangles. Replace with shimmer skeletons (CSS `bg-gradient-to-r from-surface-overlay via-white to-surface-overlay` with animation) that match the real card proportions — title line, 2 description lines, tag row.

### 3.2 Combo Card Redesign
Current card is dense and visually undifferentiated. Proposed structure:

```
┌──────────────────────────────────────┐
│  [Station emoji]  COMBO TITLE         │ ← brand-black, font-600
│                                       │
│  Short description (2 lines)          │ ← muted, text-sm
│                                       │
│  ─────────────────────────────────── │
│  🍽 Dish 1 · Dish 2 · Dish 3 +2 more │ ← caption, muted
│                                       │
│  [vegan] [high-protein]  ~640 cal    │ ← tags left, cal right
└──────────────────────────────────────┘
```

Key changes:
- Show first 3 dish names inline (currently hidden until detail)
- Move calorie count to a plain caption, not a colored badge (it's info, not status)
- Limit to 2 tags on card; +N chip for overflow

### 3.3 Generate State Feedback
"Generate" / refresh clears combos and shows skeletons but gives no sense of progress. Replace with:
1. Button enters loading state (spinner replaces icon, text becomes "Generating…")
2. Stagger card appearance with 80ms delays between cards (cards slide in one after another)
3. A subtle "Powered by Claude" attribution line below cards (brand credibility)

### 3.4 Meal Period Tab — Empty Meal Handling
When a meal period returns 0 combos (hall doesn't serve that meal), show:
```
  This hall doesn't serve [Breakfast] today.
  Try C4C or Sewall — both are open.
```
The alternative suggestions can be hardcoded per hall or fetched from the menu endpoint.

### 3.5 Date Picker UX
Currently just shows "Today, June 3". Add a subtle `▾` chevron that opens a 7-day horizontal scroll picker (today + next 6 days) so users can browse upcoming menus. Backend already stores 6 weeks of data.

---

## 4. Community Page (`/community`)

### 4.1 Feed Card — Author Attribution
Show a small avatar circle (initials, `bg-brand-gold/20 text-brand-gold`) next to username. This makes the social feed feel more personal.

### 4.2 Voting UX in Feed (Inline)
Currently upvote/downvote only available inside `ComboDetail`. Add inline upvote (upvote only, no downvote) directly on community cards in the feed — a single `▲ 12` button in the bottom-right. Downvote remains in the detail view. This matches Reddit-style micro-interaction and reduces modal opens for simple appreciation.

### 4.3 "Share Combo" Button — Floating Action Button
Move the "Share Combo" button from the page header to a fixed circular FAB at `bottom-24 right-4` (above NavBar). Standard mobile pattern, thumb-reachable. Header becomes cleaner.

### 4.4 Expiry Timer — Progressive Urgency
Currently shows a gray clock. Make urgency visual:
- `> 12h` remaining → muted gray
- `4–12h` remaining → amber text + amber clock icon
- `< 4h` remaining → red text + pulsing dot

### 4.5 Empty State Illustration
The empty community feed shows plain text. Add a simple SVG illustration (fork & plate, minimal line art in brand-gold) to make the empty state feel intentional rather than broken.

---

## 5. Trends Page (`/trends`)

### 5.1 Top 3 Podium Layout
Instead of a ranked flat list, render the top 3 as a visual podium before the rest of the list:

```
        [🥇 #1]
  [🥈 #2]     [🥉 #3]
─────────────────────────
  #4 · #5 · #6 ...
```

Each podium slot shows title, upvote count, and dining hall badge. Adds drama and encourages returning to check rankings.

### 5.2 Multi-Hall Filter Loading State
When the Trends page fetches combos from multiple dining halls in parallel, there's no loading indicator. Add a pulsing "Fetching from 3 halls…" badge below the filter bar during multi-hall loads.

### 5.3 Countdown Timer Visibility
The midnight UTC reset countdown is rendered as small text. Make it a pill badge in the header: `🔄 Resets in 4h 22m` with amber color when under 2 hours.

### 5.4 Rank Change Indicator (Future)
Placeholder: add a `+2` / `-1` delta badge next to rank number (requires persisting previous rank). Leave the UI slot now (empty), populate when backend stores daily snapshots.

---

## 6. Profile Page (`/profile`)

### 6.1 Avatar — Larger & Editable Feel
Current avatar is `w-16 h-16`. Increase to `w-20 h-20` with a subtle ring (`ring-2 ring-brand-gold/40`). Add a camera icon overlay on hover/tap to signal it's tappable (even if upload isn't wired yet — shows intent).

### 6.2 Karma Score — Contextualize
"Karma: 47" is shown but unexplained. Add a sub-label: `47 karma · top contributor` or `47 karma · getting started` based on thresholds. Makes the number meaningful.

### 6.3 My Combos — Better Empty State
If the user has no posted combos, show:
```
  You haven't shared any combos yet.
  [Share your first combo →]
```
The CTA links to `/community` and opens `PublishComboModal`.

### 6.4 Combo List Items — Visual Scan
Current profile combo list is text-only. Add a left-side colored bar (brand-gold) and show the dish count alongside the title for quicker scanning:
```
│▌  Mac & Cheese Bowl          ▲ 12
│   3 dishes · C4C · expires 4h
```

### 6.5 Destructive Actions — Confirmation
Delete combo currently fires immediately. Add an inline confirmation (replace Delete button text with "Are you sure?" + Confirm/Cancel) rather than a modal. Reduces accidental deletion.

---

## 7. Onboarding Page (`/onboarding`)

### 7.1 Welcome Moment
Step 1 currently jumps straight to a text input. Add a brief welcome card above it:
```
  Welcome to Buff Bites 🏔
  Let's set up your profile in 2 quick steps.
```
Single render, not animated — just sets context.

### 7.2 Username Availability Feedback
Username validation only checks format (3–20 chars, alphanumeric). The actual uniqueness check happens on submit and can return a 409 error. Add a debounced `GET /api/users/{username}/exists` check (or equivalent) and show a green checkmark when available. Saves users from filling step 2 and then bouncing back.

### 7.3 Dietary Prefs — Iconography
The 4 dietary preference buttons are text chips. Add small icons:
- 🌱 Vegan
- 🥗 Vegetarian  
- 🌾 Gluten-Free
- ☪️ Halal

Simple addition, makes choices scannable without reading.

### 7.4 Progress Indicator
Replace the dots with a thin progress bar at the top (`w-1/2` → `w-full` transition). More conventional and readable.

---

## 8. ComboDetail Bottom Sheet

### 8.1 Drag Handle
Add a `w-10 h-1 bg-gray-300 rounded-full mx-auto mt-2 mb-1` drag handle visual at the top. Standard mobile sheet convention — users know it's swipeable.

### 8.2 Dish List — Station Context
Dishes currently show as `name · servings`. Add the station in a smaller caption below the name:
```
  Mac & Cheese
  Expo · 1 serving
```
Station context helps users navigate the dining hall.

### 8.3 Image Gallery (Community Combos)
Image upload is broken (passes `[]` to backend). Fix the `PublishComboModal` to actually pass blob files as FormData OR disable the photo step entirely until backend image storage is wired. Showing a broken/empty image slot in the detail view is worse than not having it.

**Short-term:** Remove the photo step from `PublishComboModal` (step 3) and remove image display from `ComboDetail` until backend stores images.  
**Long-term:** Wire up S3/Cloudinary for image storage.

### 8.4 Share Button
Add a native share button (`navigator.share()`) in the detail modal header that constructs a shareable text: `"Check out this combo at C4C: Mac & Cheese Bowl – Buff Bites"`. Falls back to clipboard copy if Web Share API unavailable.

---

## 9. PublishComboModal

### 9.1 Dish Autocomplete UX
Menu autocomplete works but the dropdown styling is inconsistent with the rest of the form. Standardize:
- `rounded-xl border border-gray-200 shadow-lg` container
- Hover state: `bg-surface-overlay`
- Match max height to ~4 items with scroll

### 9.2 Step Progress — Labeled Steps
Replace dots with labeled steps: `① Hall & Date  →  ② Combo Details  →  ③ Photos`. Users know what's coming and can orient themselves.

### 9.3 Character Counters
Title and description inputs have no character limits shown. Add subtle counters (`24/60`, `80/200`) in the bottom-right of each input. Prevents over-writing and sets expectations.

### 9.4 Validation Error Placement
Validation errors currently appear as an alert banner at the bottom. Move them inline: red border + message below the specific field that failed. Standard form UX.

---

## 10. Performance & Polish

### 10.1 Scroll Restoration
When navigating back from Trends → Community, scroll position resets to top. Use `sessionStorage` to store scroll positions per page and restore on mount.

### 10.2 Pull-to-Refresh (Mobile)
Community and Trends feeds have no pull-to-refresh. Add a `usePullToRefresh` hook that triggers the existing refetch logic when the user drags down from `scrollTop === 0`. Shows a spinner below the header while refreshing.

### 10.3 Haptic Feedback (Mobile Web)
Wrap vote button presses, publish success, and combo card taps in `navigator.vibrate(10)` (single short pulse). Ignored on unsupported browsers. Makes interactions feel tactile on mobile.

### 10.4 Toast Notifications
Currently success/error states are inline banner text. Replace with a global `<Toast>` component (`bottom-20`, above NavBar) that auto-dismisses after 3s:
- ✅ `"Combo published!"` (green)
- ✅ `"Vote recorded"` (neutral)
- ❌ `"Failed to publish. Try again."` (red)

Single implementation, used everywhere instead of per-page error states.

### 10.5 Focus Visible States
Several interactive elements (cards, buttons, nav items) lack visible focus rings — fails keyboard/accessibility standards. Add `focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:outline-none` globally via Tailwind `@layer base`.

---

## Priority Order

| Priority | Item | Effort | Impact |
|---|---|---|---|
| P0 | Fix broken image upload or remove photo step | Low | High |
| P0 | Inline toast notifications | Low | High |
| P0 | Confirmation on combo delete | Low | High |
| P1 | Card redesign (dish names, calorie caption) | Medium | High |
| P1 | Community inline upvote | Low | High |
| P1 | Expiry urgency colors | Low | Medium |
| P1 | Drag handle on bottom sheet | Low | Medium |
| P2 | Typography scale token system | Medium | High |
| P2 | Surface/card color separation | Low | Medium |
| P2 | FAB for Share Combo | Low | Medium |
| P2 | Top 3 podium layout on Trends | Medium | Medium |
| P2 | Skeleton shimmer animations | Low | Medium |
| P2 | Page entry animations | Medium | Medium |
| P3 | Date picker for upcoming menus | Medium | Medium |
| P3 | Username availability check | Medium | Medium |
| P3 | Pull-to-refresh | Medium | Low |
| P3 | Share button (Web Share API) | Low | Low |
| P3 | Scroll restoration | Low | Low |
