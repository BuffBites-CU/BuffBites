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
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { getFirebaseAuth } from '@/lib/firebase'
import { getUser } from '@/services/usersService'
import { isApiStatus } from '@/services/api'
import type { UserResponse } from '@/types'

interface AuthContextValue {
  firebaseUser: User | null
  firebaseUid: string | null
  /** The signed-in user's BuffBites profile, loaded once per sign-in. */
  profile: UserResponse | null
  /** Re-fetch the profile (after edits elsewhere) and return it. */
  refreshProfile: () => Promise<UserResponse | null>
  /** Merge saved (or optimistic) changes into the loaded profile. */
  updateProfile: (changes: Partial<UserResponse>) => void
  username: string | null
  defaultDiningHall: string | null
  loading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  setUsername: (name: string) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserResponse | null>(null)
  const [username, setUsernameState] = useState<string | null>(null)
  const [defaultDiningHall, setDefaultDiningHallState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const auth = getFirebaseAuth()
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user)
      if (!user) setProfile(null)
      if (user) {
        try {
          const loaded = await getUser(user.uid)
          setProfile(loaded)
          setUsernameState(loaded.username)
          setDefaultDiningHallState(loaded.default_dining_hall ?? null)
          // Only pull the user to /home from the landing page. If they signed in
          // while browsing as a guest (e.g. to vote on /community), leave them
          // where they are.
          if (typeof window !== 'undefined' && window.location.pathname === '/') {
            router.replace('/home')
          }
        } catch (err) {
          if (isApiStatus(err, 404)) {
            router.replace('/onboarding')
          } else if (typeof window !== 'undefined' && window.location.pathname === '/') {
            // The profile didn't load (network or server error). The landing page
            // only shows a spinner to signed-in users, so move on to /home, which
            // works without it; pages that need the profile fetch it themselves.
            router.replace('/home')
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
    await signInWithPopup(auth, provider)
  }, [])

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuth()
    await firebaseSignOut(auth)
    setFirebaseUser(null)
    setProfile(null)
    setUsernameState(null)
    setDefaultDiningHallState(null)
    router.replace('/')
  }, [router])

  const refreshProfile = useCallback(async () => {
    const uid = getFirebaseAuth().currentUser?.uid
    if (!uid) return null
    const loaded = await getUser(uid)
    setProfile(loaded)
    setUsernameState(loaded.username)
    setDefaultDiningHallState(loaded.default_dining_hall ?? null)
    return loaded
  }, [])

  const updateProfile = useCallback((changes: Partial<UserResponse>) => {
    setProfile((p) => (p ? { ...p, ...changes } : p))
    if (changes.username !== undefined) setUsernameState(changes.username)
    if (changes.default_dining_hall !== undefined) setDefaultDiningHallState(changes.default_dining_hall)
  }, [])

  const setUsername = useCallback((name: string) => {
    setUsernameState(name)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        firebaseUid: firebaseUser?.uid ?? null,
        profile,
        refreshProfile,
        updateProfile,
        username,
        defaultDiningHall,
        loading,
        signIn,
        signOut,
        setUsername,
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
