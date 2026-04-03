// app/onboarding/page.tsx  (route: "/onboarding")
// "use client"
// First-time setup shown after Google sign-in when user has no backend profile yet.
// Only reachable if getUser() returned 404 in AuthContext.
//
// STEP 1 — Username
//   - Text input: "Choose a username"
//   - Validate on blur: 3–20 chars, alphanumeric + underscores only
//   - Show inline error if invalid format
//   - (Username uniqueness is enforced by backend on submit — show API error if taken)
//
// STEP 2 — Dietary preferences
//   - Heading: "Any dietary preferences?"
//   - Four toggle chips: Vegan / Vegetarian / Gluten-Free / Halal
//   - Multi-select — user can pick 0 or more
//   - Subtext: "We'll use this to tag combos for you. You can change it anytime."
//
// Submit button: "Let's eat →"
//   - Calls POST /api/users/ with { firebase_uid, username, email, dietary_preferences }
//   - firebase_uid and email come from firebaseUser in useAuth()
//   - On success: call setUsername() from useAuth(), redirect to /home
//   - On 400 "Username already taken": show error on username field, go back to step 1
//   - Show loading spinner on button while request is in flight
//
// Layout: single centered card, max-w-sm, progress dots at top showing step 1/2
