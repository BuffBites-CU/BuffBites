// components/ComboCard.tsx
// "use client"
// Reusable card shown in the Home, Community, and Trends feeds.
//
// PROPS
//   title              — string
//   description        — string
//   tags               — ComboTag[]
//   approximate_calories — number (AI combos) | undefined (community combos may not have this)
//   upvotes            — number | undefined (community + trends only)
//   author_username    — string | undefined (community + trends only)
//   dining_hall        — DiningHall | undefined (community + trends only)
//   expires_at         — string (ISO) | undefined (community only — show countdown)
//   rank               — number | undefined (Trends page only — shown as bold left label)
//   onClick            — () => void — opens ComboDetail
//
// LAYOUT (inside a rounded-xl white card with shadow-sm)
//   Top row:
//     Left: title (font-semibold, 1 line clamp)
//     Right: calorie chip (e.g. "~620 cal") in muted text, or upvote count with ↑ icon
//
//   Middle:
//     Description — 2-line clamp using line-clamp-2
//
//   Bottom row:
//     Left: tag chips (small rounded pills, color-coded — vegan=green, high-protein=blue, etc.)
//     Right: "@username" in muted text (if community) OR dining hall badge (small gray chip)
//
//   Expiry indicator (community only):
//     Small clock icon + "Xh Xm left" in muted text at the bottom
//     If < 1 hour remaining, show in orange to signal urgency
//
// Entire card is wrapped in a button (role="button") that calls onClick
// Hover state: slight scale up (hover:scale-[1.01]) + deeper shadow (hover:shadow-md)
// Transition: transition-all duration-150
