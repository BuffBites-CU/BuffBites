// app/trends/page.tsx  (route: "/trends")
// "use client"
// Leaderboard of top 20 combos by upvotes today.
//
// STATE
//   selectedHalls — DiningHall[] (multi-select, empty = all halls)
//   NOTE: the backend /trends endpoint only accepts a single dining_hall param.
//   For multi-select, fetch each selected hall separately and merge + re-sort client-side.
//   If nothing is selected, call getTrends() with no filter.
//
// DATA FLOW
//   useCommunity("trends", ...) per selected dining hall
//   Merged and sorted by upvotes descending
//
// LAYOUT (top to bottom)
//   1. Header: "Trending Today" title + subtitle showing reset time
//      e.g. "Resets in 4h 12m" — computed from midnight UTC
//
//   2. FilterBar component
//      - Multi-select dining hall chips (unlike Community which is single-select)
//
//   3. Ranked list
//      Top 3 entries get special treatment:
//        #1 — gold medal badge + slightly larger card
//        #2 — silver medal badge
//        #3 — bronze medal badge
//      Entries #4–20 — standard ComboCard with rank number on the left
//
//   4. Clicking any card → ComboDetail sheet with full info + VoteButtons
//
//   5. Empty state: "Nothing trending yet — share a combo to get on the board!"
//
// Padding at bottom: 80px to clear NavBar
