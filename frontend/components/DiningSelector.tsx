// components/DiningSelector.tsx
// "use client"
// Horizontal scrollable pill selector for choosing a dining hall.
// Used only on the Home page.
//
// PROPS
//   selected  — DiningHall
//   onChange  — (hall: DiningHall) => void
//
// OPTIONS (from DINING_HALL_LABELS in types/index.ts):
//   alley → "The Alley"
//   c4c → "C4C"
//   libby → "Libby"
//   sewall → "Sewall"
//   village_center → "Village Center"
//
// LAYOUT
//   Horizontal flex row, overflow-x-auto, no scrollbar visible (scrollbar-hide)
//   Each pill: rounded-full px-4 py-1.5 text-sm font-medium
//   Active pill: bg-brand-gold text-brand-black
//   Inactive pill: bg-gray-100 text-muted
//   Gap between pills: gap-2
//   Slight horizontal padding on the container so first/last pills don't clip
//
// When a pill is clicked, call onChange with the corresponding DiningHall slug.
// Do not call the API directly — let the parent (Home page) handle the fetch via useCombos.
