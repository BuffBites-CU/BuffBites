'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { createUser, checkUsernameAvailable } from '@/services/usersService'
import { isApiStatus } from '@/services/api'
import { DIETARY_OPTIONS, USERNAME_REGEX, USERNAME_RULE } from '@/lib/profile'
import Spinner from '@/components/Spinner'
import type { DietaryPreference } from '@/types'

const DEBOUNCE_MS = 500

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken'

export default function OnboardingPage() {
  const router = useRouter()
  const ready = useRequireAuth()
  const { firebaseUser, setUsername, refreshProfile } = useAuth()

  const [step, setStep] = useState<1 | 2>(1)
  const [username, setUsernameInput] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle')
  const [prefs, setPrefs] = useState<DietaryPreference[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    if (!USERNAME_REGEX.test(username)) {
      setUsernameStatus('idle')
      return
    }

    setUsernameStatus('checking')
    debounceTimer.current = setTimeout(async () => {
      try {
        const { available } = await checkUsernameAvailable(username)
        setUsernameStatus(available ? 'available' : 'taken')
        if (!available) setUsernameError('That username is already taken.')
        else setUsernameError('')
      } catch {
        setUsernameStatus('idle')
      }
    }, DEBOUNCE_MS)

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [username])

  function validateUsername(val: string): string {
    if (!val) return 'Username is required.'
    if (!USERNAME_REGEX.test(val)) return USERNAME_RULE
    return ''
  }

  function togglePref(pref: DietaryPreference) {
    setPrefs((p) => p.includes(pref) ? p.filter((x) => x !== pref) : [...p, pref])
  }

  function handleStep1Next() {
    const err = validateUsername(username)
    if (err) { setUsernameError(err); return }
    if (usernameStatus === 'taken') { setUsernameError('That username is already taken.'); return }
    setStep(2)
  }

  async function handleSubmit() {
    if (!firebaseUser) return
    const name = username.trim()
    setSubmitting(true)
    setSubmitError('')
    try {
      // The current server takes the uid and email from the sign-in token and
      // ignores these two fields; an older server still requires them.
      await createUser({
        firebase_uid: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        username: name,
        dietary_preferences: prefs,
      })
      setUsername(name)
      await refreshProfile().catch(() => {})
      router.replace('/home')
    } catch (e) {
      // POST /api/users/ answers 400 for a taken username and for a profile
      // that already exists (e.g. finished in another tab).
      if (isApiStatus(e, 400) && e.message.toLowerCase().includes('username')) {
        setUsernameError('That username is already taken.')
        setStep(1)
      } else if (isApiStatus(e, 400)) {
        await refreshProfile().catch(() => {})
        router.replace('/home')
      } else {
        setSubmitError(isApiStatus(e, 422) ? e.message : 'Could not create your profile. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!ready) return <Spinner page />

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        {/* Progress bar */}
        <div className="h-1 bg-surface-warm rounded-full mb-10 overflow-hidden">
          <div
            className="h-full bg-brand rounded-full transition-all duration-300"
            style={{ width: step === 1 ? '50%' : '100%' }}
          />
        </div>

        {step === 1 && (
          <div className="bg-brand/10 rounded-2xl px-5 py-4 mb-6 text-center">
            <p className="text-lg font-bold text-brand-black">Welcome to Buff Bites 🏔</p>
            <p className="text-sm text-muted mt-0.5">Let&apos;s set up your profile in 2 quick steps.</p>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-sm border border-brand-black/25 p-7 space-y-6">
          {step === 1 && (
            <>
              <div>
                <h1 className="text-2xl font-bold text-brand-black">Pick a username</h1>
                <p className="text-sm text-muted mt-1">This is how the community will know you.</p>
              </div>

              <div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-sm">@</span>
                  <input
                    autoFocus
                    value={username}
                    onChange={(e) => { setUsernameInput(e.target.value); setUsernameError('') }}
                    placeholder="buffraj"
                    maxLength={20}
                    className={`w-full rounded-xl border pl-8 pr-9 py-3 text-sm text-brand-black placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand ${
                      usernameStatus === 'taken' ? 'border-brand-black/25' : usernameStatus === 'available' ? 'border-brand-black/25' : 'border-brand-black/25'
                    }`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                    {usernameStatus === 'checking' && <Spinner size={16} className="text-muted" />}
                    {usernameStatus === 'available' && <span className="text-brand-black">✓</span>}
                    {usernameStatus === 'taken' && <span className="text-muted">✗</span>}
                  </span>
                </div>
                {usernameError ? (
                  <p className="text-xs text-brand-black mt-1.5">{usernameError}</p>
                ) : usernameStatus === 'available' ? (
                  <p className="text-xs text-brand-black mt-1.5">Username is available!</p>
                ) : null}
              </div>

              <button
                onClick={handleStep1Next}
                disabled={usernameStatus === 'checking' || usernameStatus === 'taken'}
                className="w-full py-3.5 rounded-2xl bg-brand text-white font-semibold text-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
              >
                Next →
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <h1 className="text-2xl font-bold text-brand-black">Dietary preferences?</h1>
                <p className="text-sm text-muted mt-1">
                  We'll use this to tag combos for you. You can change it anytime.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {DIETARY_OPTIONS.map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={() => togglePref(key)}
                    className={`rounded-full px-4 py-2 text-sm font-medium border transition-all flex items-center gap-1.5 ${
                      prefs.includes(key) ? 'bg-surface-overlay text-brand-black border-brand-black/25' : 'bg-surface-overlay text-muted border-transparent'
                    }`}
                  >
                    <span>{icon}</span>
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3.5 rounded-2xl border border-brand-black/25 text-sm font-medium text-brand-black hover:bg-surface-overlay transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 py-3.5 rounded-2xl bg-brand text-white font-semibold text-sm disabled:opacity-60 hover:opacity-90 active:scale-95 transition-all"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner size={16} className="text-white" />
                      Setting up…
                    </span>
                  ) : "Let's eat →"}
                </button>
              </div>
              {submitError && <p role="alert" className="text-xs text-brand-black text-center">{submitError}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
