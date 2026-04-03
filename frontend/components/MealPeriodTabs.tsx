// components/MealPeriodTabs.tsx
// "use client"
// Tab row that switches between Breakfast / Lunch / Dinner on the Home page.
//
// PROPS
//   selected  — MealPeriod
//   onChange  — (period: MealPeriod) => void
//   counts    — { Breakfast: number; Lunch: number; Dinner: number }
//               (number of combos per period — show as a small badge if < 3 to warn user)
//
// LAYOUT
//   Full-width row with 3 equal tabs separated by a bottom border
//   Active tab: bottom border in brand-gold (border-b-2 border-brand-gold), text-brand-gold
//   Inactive tab: text-muted, no border
//   Tab label: "Breakfast" / "Lunch" / "Dinner" — capitalize
//   Optional badge: if counts[period] < 3, show a small yellow warning dot next to the label
//
// No API calls made here — switching tabs is purely client-side state on the Home page.
// This component is purely presentational (receives state + callback as props).
