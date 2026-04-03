// components/VoteButtons.tsx
// "use client"
// Upvote / downvote row shown inside ComboDetail for community combos.
//
// PROPS
//   comboId     — string
//   upvotes     — number (current count, updated optimistically by parent)
//   downvotes   — number
//   hasVoted    — boolean  (from useCommunity — true if user already voted on this combo)
//   onVote      — (type: VoteType) => void  (calls useCommunity.vote internally)
//
// LAYOUT
//   Horizontal row, sticky at bottom of ComboDetail sheet
//   White background + top border separator
//   Padding: py-3 px-4
//
//   Left side: upvote button
//     ↑ icon + "{upvotes}" count
//     Active color (after upvote): brand-gold
//     Disabled state if hasVoted === true: grayed out, cursor-not-allowed
//
//   Right side: downvote button
//     ↓ icon + "{downvotes}" count
//     Active color (after downvote): red-400
//     Same disabled behavior
//
//   Loading state: show a subtle spinner on the button that was just tapped
//     while the API call is in flight (show for at most ~500ms, then resolve)
//
// When a user is not signed in: show "Sign in to vote" text instead of buttons
// Check firebaseUid from useAuth() to determine this.
