// components/FilterBar.tsx
// "use client"
// Dining hall filter chips for Community and Trends pages.
//
// PROPS
//   selected   — DiningHall | undefined        (single-select, used on Community page)
//   selectedMulti — DiningHall[]               (multi-select, used on Trends page)
//   mode       — "single" | "multi"
//   onChange   — (hall: DiningHall | undefined) => void       (single mode)
//   onChangeMulti — (halls: DiningHall[]) => void             (multi mode)
//
// OPTIONS
//   "All" chip (no filter) + one chip per dining hall from DINING_HALL_LABELS
//
// SINGLE MODE (Community page)
//   Only one chip active at a time.
//   Selecting "All" sets selected to undefined.
//   Selecting a hall sets selected to that DiningHall.
//   Active: bg-brand-gold text-brand-black
//   Inactive: bg-gray-100 text-muted
//
// MULTI MODE (Trends page)
//   Multiple chips can be active simultaneously.
//   Tapping an active chip deselects it.
//   If all chips are deselected, falls back to showing all halls (empty array = no filter).
//   Active chips: bg-brand-gold text-brand-black
//   Inactive chips: bg-gray-100 text-muted
//
// Layout: same horizontal scroll row as DiningSelector — overflow-x-auto, gap-2
