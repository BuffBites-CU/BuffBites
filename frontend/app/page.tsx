// app/page.tsx  (route: "/")
// Landing / sign-in page. Only shown to unauthenticated users.
//
// If loading === true (AuthContext still resolving) → show full-screen spinner
// If firebaseUser exists → redirect to /home (AuthContext handles this automatically)
//
// UI when signed out:
//   - BuffBites logo centered on screen
//   - Tagline: "Discover your next great meal at CU Boulder"
//   - "Sign in with Google" button
//       → calls signIn() from useAuth()
//       → Firebase popup opens
//       → on success, AuthContext redirects to /home or /onboarding automatically
//
// Tailwind layout: full-screen flex column, items centered, gap between elements
// Brand colors: gold button, black text
