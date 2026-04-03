// app/profile/page.tsx  (route: "/profile")
// "use client"
// User profile page — view and edit your account.
//
// DATA FLOW
//   On mount: call getUser(firebaseUid) from usersService to load full profile
//   firebaseUid comes from useAuth()
//
// VIEW MODE LAYOUT (top to bottom)
//   1. Avatar — Google profile photo from firebaseUser.photoURL
//      Rounded full, 80px, centered
//
//   2. Username (@handle) in large text + karma badge
//      Karma shown as a gold chip: e.g. "★ 42 karma"
//
//   3. Dietary preferences
//      Row of colored chips: Vegan (green) / Vegetarian (light green) /
//      Gluten-Free (yellow) / Halal (blue)
//      Show "No preferences set" if empty
//
//   4. "Edit Profile" button → switches to edit mode (inline, no route change)
//
//   5. "Sign Out" button → calls signOut() from useAuth()
//
// EDIT MODE
//   Username field (pre-filled, editable)
//   Dietary preference toggles (same chips, now tappable to toggle)
//   "Save" button → PUT /api/users/{firebase_uid} with changed fields only
//     On success: update local state, exit edit mode, show success toast
//     On 400 "Username taken": show inline error on username field
//   "Cancel" button → discard changes, revert to view mode
//
// Future: show a list of combos the user has published
//   (not yet returned by backend — will need a new endpoint or query)
