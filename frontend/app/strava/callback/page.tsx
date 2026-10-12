'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { completeStravaConnect } from '@/services/coachService'
import Doodle from '@/components/Doodle'

/**
 * Strava sends the browser here after the student approves (or cancels).
 * The code is handed to the backend with the student's own sign-in token; the
 * backend checks the link was started from this same account.
 */
function Callback() {
  const params = useSearchParams()
  const router = useRouter()
  const { firebaseUser, loading } = useAuth()
  const { showToast } = useToast()
  const started = useRef(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading || started.current) return
    started.current = true

    const code = params.get('code')
    const state = params.get('state')
    if (params.get('error') || !code || !state) {
      setError(params.get('error') === 'access_denied' ? 'You cancelled on Strava, so nothing was connected.' : 'Strava didn’t send a sign-in back.')
      return
    }
    if (!firebaseUser) {
      setError('Sign in to BuffBites first, then connect Strava from your profile.')
      return
    }
    // Drop the one-time code from the address bar and history.
    window.history.replaceState(null, '', '/strava/callback')
    firebaseUser.getIdToken()
      .then((token) => completeStravaConnect(token, code, state, params.get('scope') ?? ''))
      .then((s) => {
        showToast(s.athlete_name ? `Strava connected as ${s.athlete_name}` : 'Strava connected', 'success')
        router.replace('/profile')
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not connect Strava.'))
  }, [loading, firebaseUser, params, router, showToast])

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="card max-w-sm w-full p-6 text-center">
        <span className="plan-label">Link · Strava</span>
        <Doodle name="shoe" size={72} className={`mx-auto my-3 text-brand-black ${error ? '' : 'animate-float'}`} />
        {error ? (
          <>
            <p className="text-[15px] text-brand-black" role="alert">{error}</p>
            <Link href="/profile" className="mt-4 inline-block rounded-xl bg-brand-black px-5 py-2.5 font-display text-[18px] text-white">
              Back to profile
            </Link>
          </>
        ) : (
          <p className="text-[15px] text-brand-black" role="status">Connecting your Strava…</p>
        )}
      </div>
    </main>
  )
}

export default function StravaCallbackPage() {
  return (
    <Suspense fallback={null}>
      <Callback />
    </Suspense>
  )
}
