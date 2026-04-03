// hooks/useCommunity.ts
// Manages state for the community combo feed on Community and Trends pages.
//
// Parameters: mode ("feed" | "trends"), dining_hall (DiningHall | undefined)
//
// Returns:
//   combos   — CommunityCombo[]
//   loading  — boolean
//   error    — string | null
//   refetch  — () => void
//   vote     — (combo_id: string, type: VoteType) => Promise<void>
//
// Behavior:
//   - In "feed" mode calls getCombos(), in "trends" mode calls getTrends()
//   - Refetches whenever dining_hall filter changes
//   - vote() function:
//       1. Optimistically updates the upvotes/downvotes count in local state
//          immediately so the UI responds without waiting for the API
//       2. Calls communityService.vote() in the background
//       3. On error: rolls back the optimistic update and sets error message
//       4. Requires firebaseUid from useAuth() — call useAuth() inside this hook
//   - Tracks which combo_ids have been voted on in a local Set
//     so the VoteButtons component can show a "voted" disabled state
//     (server-side duplicate prevention is not yet implemented)
