import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

// Use the current origin as the auth domain in the browser so Firebase's
// sign-in handler is served same-origin (via the /__/auth proxy in
// next.config.ts). This is what makes signInWithRedirect survive iOS Safari's
// storage partitioning. localhost has no proxy, so fall back to the Firebase
// default there (and during SSR, where window is undefined).
function resolveAuthDomain(): string | undefined {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return window.location.host
    }
  }
  return process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
}

// Lazy getter — never called at module init, only when browser code executes.
// This prevents Firebase from throwing auth/invalid-api-key during SSR/build.
export function getFirebaseAuth() {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: resolveAuthDomain(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  }
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()
  return getAuth(app)
}
