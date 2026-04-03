// hooks/useCombos.ts
// Manages state for AI combo generation on the Home page.
//
// Parameters: dining (DiningHall), date (string, optional)
//
// Returns:
//   data     — ComboResponse | null   (full response with Breakfast/Lunch/Dinner)
//   loading  — boolean                (true while Claude is generating)
//   error    — string | null          (error message to show in UI)
//   refetch  — () => void             (lets user manually retry on error)
//
// Behavior:
//   - Fetches when `dining` or `date` changes (useEffect dependency)
//   - Caches the last successful result by (dining + date) key
//     so switching back to a previously selected hall is instant
//   - Does NOT refetch when switching between Breakfast/Lunch/Dinner tabs
//     (those tabs just filter the already-loaded data client-side)
//   - Sets loading = true immediately on new fetch so UI shows a skeleton
