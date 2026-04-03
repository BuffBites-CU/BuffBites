// services/communityService.ts
// All calls to /api/community/* endpoints.
//
// getCombos(dining_hall?: DiningHall): Promise<CommunityCombo[]>
//   GET /api/community/combos?dining_hall={optional}
//   Returns all active (non-expired) combos sorted by upvotes descending
//
// getCombo(combo_id: string): Promise<CommunityCombo>
//   GET /api/community/combos/{combo_id}
//   Called when a card is clicked to load full details into ComboDetail modal
//
// publishCombo(combo: ComboCreate, firebase_uid: string, username: string): Promise<CommunityCombo>
//   POST /api/community/combos?firebase_uid={uid}&username={username}
//   Body: ComboCreate JSON
//   Called on final step of PublishComboModal
//
// vote(combo_id: string, vote_type: VoteType, firebase_uid: string): Promise<{ message: string }>
//   POST /api/community/combos/{combo_id}/vote?vote_type={type}&firebase_uid={uid}
//   Called from VoteButtons inside ComboDetail
//
// getTrends(dining_hall?: DiningHall): Promise<CommunityCombo[]>
//   GET /api/community/trends?dining_hall={optional}
//   Returns top 20 by upvotes — used on the Trends page
