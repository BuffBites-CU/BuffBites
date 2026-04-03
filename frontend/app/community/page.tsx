// app/community/page.tsx  (route: "/community")
// "use client"
// Browse and publish user-submitted combos.
//
// STATE
//   selectedDining  — DiningHall | undefined (undefined = show all halls)
//   publishOpen     — boolean, controls whether PublishComboModal is shown
//
// DATA FLOW
//   useCommunity("feed", selectedDining) → { combos, loading, error, refetch, vote }
//
// LAYOUT (top to bottom)
//   1. Header bar
//      - Left: "Community" title
//      - Right: "Share Combo" button (gold, opens PublishComboModal)
//        Only shown when user is authenticated
//
//   2. FilterBar component
//      - Single-select dining hall chips + "All" option
//      - Changing selection sets selectedDining → triggers hook refetch
//
//   3. Combo feed
//      Loading:  skeleton cards
//      Empty:    "No combos yet today — be the first!" with an illustration
//      Loaded:   vertical list of CommunityComboCards
//        Each card shows: title, description (2-line clamp), author @username,
//        upvote count, dining hall badge, time remaining before expiry
//
//   4. Clicking a card → ComboDetail sheet (full info + VoteButtons)
//
//   5. PublishComboModal rendered conditionally when publishOpen === true
//      On publish success: close modal, call refetch() to reload feed
//
// Padding at bottom: 80px to clear NavBar
