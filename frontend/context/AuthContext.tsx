// context/AuthContext.tsx
// "use client" — this is a client component (uses browser APIs + Firebase)
//
// PURPOSE
//   Single source of Firebase auth state for the whole app.
//   Wraps the app in AuthProvider so any component can call useAuth().
//
// STATE
//   firebaseUser  — Firebase User object (null if signed out)
//   firebaseUid   — shorthand string UID (null if signed out)
//   username      — username string loaded from our backend (null until resolved)
//   loading       — true while onAuthStateChanged hasn't fired yet
//                   show a full-screen spinner while loading === true
//
// METHODS
//   signIn()
//     Opens Google sign-in popup via Firebase (GoogleAuthProvider + signInWithPopup)
//     After popup resolves, onAuthStateChanged fires automatically
//
//   signOut()
//     Calls Firebase signOut, clears local state, redirects to "/"
//
//   setUsername(name)
//     Called by Onboarding page after creating the user profile
//     so the username is immediately available without re-fetching
//
// EFFECT — onAuthStateChanged listener
//   When a Firebase user is detected:
//     1. Call getUser(uid) from usersService
//     2. If 200 → set username, redirect to /home
//     3. If 404 → user exists in Firebase but hasn't onboarded → redirect to /onboarding
//     4. Always set loading = false after resolving
//   When no user: set loading = false, stay on current route
//
// useAuth() hook
//   Convenience hook that reads from AuthContext
//   Throws if used outside of AuthProvider (safety check)
