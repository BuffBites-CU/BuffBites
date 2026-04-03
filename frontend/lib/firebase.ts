// lib/firebase.ts
// Firebase app initialization — imported once, used everywhere.
//
// Read the following from environment variables (set in .env.local):
//   NEXT_PUBLIC_FIREBASE_API_KEY
//   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
//   NEXT_PUBLIC_FIREBASE_PROJECT_ID
//   NEXT_PUBLIC_FIREBASE_APP_ID
//
// Initialize the Firebase app with initializeApp(firebaseConfig)
// Export `auth` — the Firebase Auth instance (getAuth(app))
//   used by AuthContext for signInWithPopup and onAuthStateChanged
//
// Use a singleton guard so the app isn't initialized more than once
// when Next.js hot-reloads in development
