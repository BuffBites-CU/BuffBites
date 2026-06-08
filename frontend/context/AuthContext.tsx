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

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [username, setUsernameState] = useState<string | null>(null)
  const [defaultDiningHall, setDefaultDiningHallState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const auth = getFirebaseAuth()
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user)
      if (user) {
        try {
          const profile = await getUser(user.uid)
          setUsernameState(profile.username)
          setDefaultDiningHallState(profile.default_dining_hall ?? null)
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
