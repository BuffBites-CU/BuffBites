// services/combosService.ts
// All calls to the AI combo generation endpoint.
//
// generateCombos(dining: DiningHall, date?: string): Promise<ComboResponse>
//   GET /api/combos/generate?dining={dining}&date={date}
//   - date defaults to today on the backend if omitted
//   - Returns ComboResponse with Breakfast / Lunch / Dinner arrays
//   - This is the most expensive call (hits Claude API) — results should be
//     cached in useCombos hook so switching meal period tabs doesn't re-fetch
