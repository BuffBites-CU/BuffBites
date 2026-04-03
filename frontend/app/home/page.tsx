// app/home/page.tsx  (route: "/home")
// "use client"
// Main AI combo discovery screen.
//
// STATE
//   selectedDining  — DiningHall, default "c4c"
//   selectedPeriod  — MealPeriod, default "Lunch"
//   selectedDate    — string (YYYY-MM-DD), default today
//
// DATA FLOW
//   useCombos(selectedDining, selectedDate) → { data, loading, error, refetch }
//   When data is loaded, render data.combos[selectedPeriod] — no extra fetch on tab switch
//
// LAYOUT (top to bottom)
//   1. Header bar
//      - Left: "BuffBites" wordmark
//      - Right: date chip showing today's date (e.g. "Fri Apr 3")
//
//   2. DiningSelector component
//      - Horizontal scrollable pill row
//      - Selecting a new hall sets selectedDining → triggers useCombos refetch
//
//   3. MealPeriodTabs component
//      - Tabs: Breakfast | Lunch | Dinner
//      - Active tab highlighted in brand-gold
//      - Switching tabs only changes selectedPeriod (no re-fetch)
//
//   4. Combo grid
//      Loading state:  3 skeleton cards (gray pulsing rectangles)
//      Error state:    Error message + "Try again" button that calls refetch()
//      Loaded state:   3 ComboCards in a vertical list (or 2-col grid on desktop)
//
//   5. Clicking a ComboCard → opens ComboDetail sheet (bottom sheet on mobile)
//
// Padding at bottom: 80px to clear the fixed NavBar
