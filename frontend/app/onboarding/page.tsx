'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { createUser } from '@/services/usersService'
import type { DietaryPreference } from '@/types'

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/

const DIETARY_OPTIONS: { key: DietaryPreference; label: string; style: string }[] = [
  { key: 'vegan', label: 'Vegan', style: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { key: 'vegetarian', label: 'Vegetarian', style: 'bg-green-100 text-green-800 border-green-200' },
  { key: 'gluten-free', label: 'Gluten-Free', style: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { key: 'halal', label: 'Halal', style: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const { firebaseUser, setUsername } = useAuth()

  const [step, setStep] = useState<1 | 2>(1)
  const [username, setUsernameInput] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [prefs, setPrefs] = useState<DietaryPreference[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!firebaseUser) router.replace('/')
  }, [firebaseUser, router])

  function validateUsername(val: string): string {
    if (!val) return 'Username is required.'
    if (!USERNAME_REGEX.test(val)) return '3–20 characters: letters, numbers, underscores only.'
    return ''
  }

  function handleUsernameBlur() {
    setUsernameError(validateUsername(username))
  }

  function togglePref(pref: DietaryPreference) {
    setPrefs((p) => p.includes(pref) ? p.filter((x) => x !== pref) : [...p, pref])
  }

  function handleStep1Next() {
    const err = validateUsername(username)
    if (err) { setUsernameError(err); return }
    setStep(2)
  }

  async function handleSubmit() {
    if (!firebaseUser) return
    setSubmitting(true)
    try {
      await createUser({
        firebase_uid: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        username: username.trim(),
        dietary_preferences: prefs,
      })
      setUsername(username.trim())
      router.replace('/home')
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.toLowerCase().includes('username')) {
        setUsernameError('That username is already taken.')
        setStep(1)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-10">
          {([1, 2] as const).map((s) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all duration-300 ${
                s <= step ? 'w-8 bg-brand-gold' : 'w-2 bg-gray-200'
              }`}
            />
          ))}
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-7 space-y-6">
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
                    onBlur={handleUsernameBlur}
                    placeholder="buffraj"
                    maxLength={20}
                    className="w-full rounded-xl border border-gray-200 pl-8 pr-4 py-3 text-sm text-brand-black placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold"
                  />
                </div>
                {usernameError && (
                  <p className="text-xs text-red-500 mt-1.5">{usernameError}</p>
                )}
              </div>

              <button
                onClick={handleStep1Next}
                className="w-full py-3.5 rounded-2xl bg-brand-gold text-brand-black font-semibold text-sm hover:opacity-90 active:scale-95 transition-all"
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
                {DIETARY_OPTIONS.map(({ key, label, style }) => (
                  <button
                    key={key}
                    onClick={() => togglePref(key)}
                    className={`rounded-full px-4 py-2 text-sm font-medium border transition-all ${
                      prefs.includes(key) ? style : 'bg-gray-100 text-muted border-transparent'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3.5 rounded-2xl border border-gray-200 text-sm font-medium text-brand-black hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 py-3.5 rounded-2xl bg-brand-gold text-brand-black font-semibold text-sm disabled:opacity-60 hover:opacity-90 active:scale-95 transition-all"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Setting up…
                    </span>
                  ) : "Let's eat →"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
