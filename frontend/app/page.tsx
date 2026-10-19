'use client'

import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import Image from 'next/image'
import { DevicePhoneMobileIcon } from '@/components/icons'
import { openInstallGuide } from '@/components/InstallPrompt'
import Doodle from '@/components/Doodle'
import Spinner from '@/components/Spinner'

const FEATURES = [
  { icon: 'A', label: 'AI combos' },
  { icon: 'B', label: 'Snap your plate' },
  { icon: 'C', label: 'Trending picks' },
  { icon: 'D', label: 'Fuel Score' },
]

export default function LandingPage() {
  const { firebaseUser, loading, signIn } = useAuth()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState('')

  if (loading || firebaseUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <Spinner size={20} />
      </div>
    )
  }

  async function handleSignIn() {
    setSigningIn(true)
    setError('')
    try {
      await signIn()
    } catch (err) {
      console.error('[auth] sign-in failed:', err)
      setError('Sign-in failed. Please try again.')
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col">

      {/* ── Top: add-to-home-screen guide ─────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex justify-end px-4 pt-4">
        <button onClick={openInstallGuide} className="pill-gold card-press shadow-soft">
          <DevicePhoneMobileIcon width={15} height={15} />
          Add to Home Screen
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-20 pb-6 relative z-10">
        {/* Logo */}
        <div className="w-24 h-24 overflow-hidden rounded-3xl shadow-soft-lg animate-pop-in">
          <Image src="/logoi.jpeg" alt="BuffBites logo" width={96} height={96} className="object-cover w-full h-full" priority />
        </div>

        <span className="plan-label mt-6">Campus mess · Ground floor plan</span>
        <h1 className="mt-2 text-[44px] leading-none text-brand-black text-center">Eat smarter, Buffs.</h1>
        <p className="mt-3 text-[15px] text-muted text-center leading-relaxed">
          AI meal combos from today&apos;s menus<br />at every CU Boulder dining hall
        </p>

        {/* Floating doodles: what's on the menu */}
        <div className="mt-8 grid grid-cols-3 gap-3 w-full max-w-[300px]">
          {([
            ['burger', 'Grill'], ['bowl', 'Wok'], ['pizza', 'Oven'],
            ['salad', 'Greens'], ['taco', 'Latin'], ['icecream', 'Dessert'],
          ] as const).map(([d, room], i) => (
            <div
              key={d}
              className="card relative aspect-square flex items-center justify-center text-brand-black animate-pop-in"
              style={{ animationDelay: `${120 + i * 70}ms` }}
            >
              <span className="absolute left-1.5 top-1 text-[10px] font-semibold text-muted">{room}</span>
              <div className="animate-float mt-2" style={{ animationDelay: `${i * 0.35}s` }}>
                <Doodle name={d} size={48} />
              </div>
            </div>
          ))}
        </div>

        {/* Feature pills */}
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {FEATURES.map(({ icon, label }) => (
            <span key={label} className="flex items-center gap-1.5 rounded-full bg-surface-card shadow-soft px-3.5 py-1.5 text-[13px] text-brand-black">
              <span aria-hidden className="font-mono text-[10px] text-muted">{icon}</span>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Sign-in ───────────────────────────────────────────── */}
      <div className="relative z-10 px-6 pb-10 flex flex-col items-center gap-3 w-full max-w-sm mx-auto">
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          className="w-full flex items-center justify-center gap-3 bg-brand-black text-white rounded-2xl py-4 font-display text-[20px] shadow-soft-lg card-press disabled:opacity-60"
        >
          {signingIn ? <Spinner size={20} className="text-white" /> : <GoogleIcon />}
          {signingIn ? 'Signing in…' : 'Continue with Google'}
        </button>

        {error && (
          <p role="alert" className="text-center text-sm text-brand-black font-medium bg-surface-card shadow-soft rounded-full px-4 py-1.5">{error}</p>
        )}

        <p className="text-[12px] text-center text-muted pt-1">
          Sign in to save combos & track meals
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
