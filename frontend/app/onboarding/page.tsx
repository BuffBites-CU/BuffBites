'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { createUser, checkUsernameAvailable } from '@/services/usersService'
import type { DietaryPreference } from '@/types'

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/
const DEBOUNCE_MS = 500

const DIETARY_OPTIONS: { key: DietaryPreference; label: string; icon: string; style: string }[] = [
  { key: 'vegan', label: 'Vegan', icon: '🌱', style: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { key: 'vegetarian', label: 'Vegetarian', icon: '🥗', style: 'bg-green-100 text-green-800 border-green-200' },
  { key: 'gluten-free', label: 'Gluten-Free', icon: '🌾', style: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { key: 'halal', label: 'Halal', icon: '☪️', style: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
]

const AVATARS = [
  { id: 'avatar1', src: '/avatar1.jpeg' },
  { id: 'avatar2', src: '/avatar2.jpeg' },
  { id: 'avatar3', src: '/avatar3.jpeg' },
  { id: 'avatar4', src: '/avatar4.jpeg' },
  { id: 'avatar5', src: '/avatar5.jpeg' },
]

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken'

export default function OnboardingPage() {
  const router = useRouter()
  const { firebaseUser, setUsername } = useAuth()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [username, setUsernameInput] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle')
  const [prefs, setPrefs] = useState<DietaryPreference[]>([])
  const [avatar, setAvatar] = useState<string>('avatar1')
  const [submitting, setSubmitting] = useState(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!firebaseUser) router.replace('/')
  }, [firebaseUser, router])

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
    if (!USERNAME_REGEX.test(val)) return '3–20 characters: letters, numbers, underscores only.'
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
    setSubmitting(true)
    try {
      await createUser({
        firebase_uid: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        username: username.trim(),
        dietary_preferences: prefs,
        avatar,
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

  const progressWidth = step === 1 ? '33%' : step === 2 ? '66%' : '100%'

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        {/* Progress bar */}
        <div className="h-1 bg-gray-200 rounded-full mb-10 overflow-hidden">
          <div
            className="h-full bg-brand-gold rounded-full transition-all duration-300"
            style={{ width: progressWidth }}
          />
        </div>

        {step === 1 && (
          <div className="bg-brand-gold/10 rounded-2xl px-5 py-4 mb-6 text-center">
            <p className="text-lg font-bold text-brand-black">Welcome to Buff Bites 🏔</p>
            <p className="text-sm text-muted mt-0.5">Let&apos;s set up your profile in 3 quick steps.</p>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-7 space-y-6">

          {/* Step 1 — Username */}
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
                    className={`w-full rounded-xl border pl-8 pr-9 py-3 text-sm text-brand-black placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold ${
                      usernameStatus === 'taken' ? 'border-red-300' : usernameStatus === 'available' ? 'border-emerald-300' : 'border-gray-200'
                    }`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                    {usernameStatus === 'checking' && (
                      <svg className="animate-spin h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    {usernameStatus === 'available' && <span className="text-emerald-500">✓</span>}
                    {usernameStatus === 'taken' && <span className="text-red-400">✗</span>}
                  </span>
                </div>
                {usernameError ? (
                  <p className="text-xs text-red-500 mt-1.5">{usernameError}</p>
                ) : usernameStatus === 'available' ? (
                  <p className="text-xs text-emerald-600 mt-1.5">Username is available!</p>
                ) : null}
              </div>
              <button
                onClick={handleStep1Next}
                disabled={usernameStatus === 'checking' || usernameStatus === 'taken'}
                className="w-full py-3.5 rounded-2xl bg-brand-gold text-brand-black font-semibold text-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
              >
                Next →
              </button>
            </>
          )}

          {/* Step 2 — Dietary preferences */}
          {step === 2 && (
            <>
              <div>
                <h1 className="text-2xl font-bold text-brand-black">Dietary preferences?</h1>
                <p className="text-sm text-muted mt-1">
                  We'll use this to tag combos for you. You can change it anytime.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {DIETARY_OPTIONS.map(({ key, label, icon, style }) => (
                  <button
                    key={key}
                    onClick={() => togglePref(key)}
                    className={`rounded-full px-4 py-2 text-sm font-medium border transition-all flex items-center gap-1.5 ${
                      prefs.includes(key) ? style : 'bg-gray-100 text-muted border-transparent'
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
                  className="flex-1 py-3.5 rounded-2xl border border-gray-200 text-sm font-medium text-brand-black hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 py-3.5 rounded-2xl bg-brand-gold text-brand-black font-semibold text-sm hover:opacity-90 active:scale-95 transition-all"
                >
                  Next →
                </button>
              </div>
            </>
          )}

          {/* Step 3 — Avatar */}
          {step === 3 && (
            <>
              <div>
                <h1 className="text-2xl font-bold text-brand-black">Pick your avatar</h1>
                <p className="text-sm text-muted mt-1">Choose a profile picture for your account.</p>
              </div>
              <div className="grid grid-cols-5 gap-3">
                {AVATARS.map(({ id, src }) => (
                  <button
                    key={id}
                    onClick={() => setAvatar(id)}
                    className={`relative rounded-full overflow-hidden border-4 transition-all aspect-square ${
                      avatar === id ? 'border-brand-gold scale-105' : 'border-transparent'
                    }`}
                  >
                    <Image
                      src={src}
                      alt={id}
                      fill
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
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