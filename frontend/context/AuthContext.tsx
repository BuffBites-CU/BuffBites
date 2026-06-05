'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { getFirebaseAuth } from '@/lib/firebase'
import { getUser } from '@/services/usersService'

interface AuthContextValue {
  firebaseUser: User | null
  firebaseUid: string | null
  username: string | null
  defaultDiningHall: string | null
  loading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  setUsername: (name: string) => void
  setDefaultDiningHall: (hall: string | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

// signInWithPopup is unreliable on mobile browsers (iOS Safari blocks the popup
// outright) and in installed PWAs. Detect those so we can use a redirect flow.
function isMobileBrowser(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  const isMobileUa = /iPhone|iPad|iPod|Android/i.test(ua)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  return isMobileUa || isStandalone
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [username, setUsernameState] = useState<string | null>(null)
  const [defaultDiningHall, setDefaultDiningHallState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const auth = getFirebaseAuth()
    // Surface any error from a redirect-based sign-in (mobile Safari path).
    // Don't await here — onAuthStateChanged handles the signed-in user; this
    // just logs failures that would otherwise be swallowed.
    getRedirectResult(auth).catch((err) => {
      console.error('[auth] redirect sign-in failed:', err)
    })
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user)
      if (user) {
        try {
          const profile = await getUser(user.uid)
          setUsernameState(profile.username)
          setDefaultDiningHallState(profile.default_dining_hall ?? null)
          router.replace('/home')
        } catch (err) {
          const msg = err instanceof Error ? err.message : ''
          if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
            router.replace('/onboarding')
          }
        }
      }
      setLoading(false)
    })
    return unsub
  }, [router])

  const signIn = useCallback(async () => {
    const auth = getFirebaseAuth()
    const provider = new GoogleAuthProvider()

    // iOS Safari (and other mobile browsers / installed PWAs) block the OAuth
    // popup, so it never opens. Use a full-page redirect on mobile instead.
    if (isMobileBrowser()) {
      await signInWithRedirect(auth, provider)
      return
    }

    // Desktop: prefer the popup, but fall back to redirect if it's blocked.
    try {
      await signInWithPopup(auth, provider)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        await signInWithRedirect(auth, provider)
        return
      }
      throw err
    }
  }, [])

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuth()
    await firebaseSignOut(auth)
    setFirebaseUser(null)
    setUsernameState(null)
    setDefaultDiningHallState(null)
    router.replace('/')
  }, [router])

  const setUsername = useCallback((name: string) => {
    setUsernameState(name)
  }, [])

  const setDefaultDiningHall = useCallback((hall: string | null) => {
    setDefaultDiningHallState(hall)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        firebaseUid: firebaseUser?.uid ?? null,
        username,
        defaultDiningHall,
        loading,
        signIn,
        signOut,
        setUsername,
        setDefaultDiningHall,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
