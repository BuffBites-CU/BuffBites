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
import type { UserResponse } from '@/types'

interface AuthContextValue {
  firebaseUser: User | null
  firebaseUid: string | null
  /** The signed-in user's BuffBites profile, loaded once per sign-in. */
  profile: UserResponse | null
  /** Re-fetch the profile (after edits elsewhere) and return it. */
  refreshProfile: () => Promise<UserResponse | null>
  username: string | null
  defaultDiningHall: string | null
  loading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  setUsername: (name: string) => void
  setDefaultDiningHall: (hall: string | null) => void
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
        profile,
        refreshProfile,
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
