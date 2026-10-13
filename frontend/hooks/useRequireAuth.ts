'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'

/**
 * For pages that need a signed-in user: sends guests to the landing page.
 * Returns true once auth has resolved and a user is signed in.
 */
export function useRequireAuth(): boolean {
  const { firebaseUser, loading } = useAuth()
  const router = useRouter()
  useEffect(() => {
    if (!loading && !firebaseUser) router.replace('/')
  }, [loading, firebaseUser, router])
  return !loading && !!firebaseUser
}
