'use client'

import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import Image from 'next/image'
import { DevicePhoneMobileIcon } from '@/components/icons'
import { openInstallGuide } from '@/components/InstallPrompt'

const FEATURES = [
  { icon: '✦', label: 'AI-crafted combos' },
  { icon: '◈', label: 'All 5 dining halls' },
  { icon: '◎', label: 'Community feed' },
  { icon: '◇', label: 'Calorie tracking' },
]

export default function LandingPage() {
  const { firebaseUser, loading, signIn } = useAuth()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState('')

  if (loading || firebaseUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <LoadingSpinner />
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
    <div className="min-h-screen bg-surface relative overflow-hidden flex flex-col">

      {/* ── Top nav: add-to-home-screen guide ───────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex justify-end px-4 pt-4">
        <button
          onClick={openInstallGuide}
          className="flex items-center gap-1.5 rounded-full bg-brand-gold border border-brand-gold px-3.5 py-1.5 text-xs font-semibold text-brand-black shadow-gold hover:opacity-90 active:scale-[0.97] transition-all animate-gold-pulse"
        >
          <DevicePhoneMobileIcon width={14} height={14} />
          Add to Home Screen
        </button>
      </div>

      {/* ── Background: warm gradient ───────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 80%, #E8DEC8 0%, transparent 70%)',
        }}
      />

      {/* ── Mountain ridge silhouette ───────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none select-none">
        <svg
          viewBox="0 0 390 160"
          preserveAspectRatio="xMidYMax slice"
          className="w-full h-44"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Far range — lightest */}
          <path
            d="M0 160 L0 105 L38 72 L65 88 L95 52 L122 74 L148 45 L178 68 L200 50 L222 65 L250 38 L278 62 L305 44 L332 68 L355 50 L390 72 L390 160Z"
            fill="#EDE6D4"
          />
          {/* Mid range */}
          <path
            d="M0 160 L0 120 L55 88 L85 102 L115 78 L145 94 L168 72 L195 88 L215 74 L242 90 L268 68 L295 84 L318 66 L345 82 L365 70 L390 86 L390 160Z"
            fill="#E4DAC6"
          />
          {/* Near ridge — darkest */}
          <path
            d="M0 160 L0 135 L45 112 L75 124 L100 108 L130 118 L155 100 L180 114 L200 104 L225 116 L250 98 L278 112 L302 96 L330 110 L355 98 L390 112 L390 160Z"
            fill="#D8CEB8"
          />
        </svg>
      </div>

      {/* ── Main content ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8 relative z-10">

        {/* Logo block */}
        <div className="flex flex-col items-center gap-5 mb-10">
          {/* Logo */}
          <div className="w-24 h-24 rounded-full overflow-hidden shadow-gold flex-shrink-0"
            style={{ boxShadow: '0 8px 28px rgba(207,184,124,0.38), 0 2px 8px rgba(26,20,16,0.20)' }}>
            <Image src="/logoi.jpeg" alt="BuffBites logo" width={96} height={96} className="object-cover w-full h-full" priority />
          </div>

          {/* Tagline */}
          <div className="text-center">
            <p className="text-sm text-muted leading-relaxed">
              AI-crafted meal combos for<br />CU Boulder dining halls
            </p>
          </div>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {FEATURES.map(({ icon, label }) => (
            <span
              key={label}
              className="flex items-center gap-1.5 rounded-full bg-white/70 border border-brand-stone/30 px-3.5 py-1.5 text-xs text-muted font-medium backdrop-blur-sm shadow-card-sm"
            >
              <span className="text-brand-gold text-[10px]">{icon}</span>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Sign-in panel ───────────────────────────────────────── */}
      <div className="relative z-10 px-6 pb-12 flex flex-col items-center gap-3 w-full max-w-sm mx-auto">
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          className="w-full flex items-center justify-center gap-3 bg-brand-black text-white rounded-2xl py-4 font-display font-semibold text-[15px] tracking-wide shadow-card-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {signingIn ? <LoadingSpinner white /> : <GoogleIcon />}
          {signingIn ? 'Signing in…' : 'Continue with Google'}
        </button>

        {error && (
          <p className="text-center text-sm text-red-500 font-medium">{error}</p>
        )}

        <p className="text-[11px] text-center text-muted/70 pt-1">
          CU Boulder students · Buffalo pride 🦬
        </p>
      </div>
    </div>
  )
}

function LoadingSpinner({ white }: { white?: boolean }) {
  return (
    <svg
      className={`animate-spin h-5 w-5 ${white ? 'text-white' : 'text-brand-gold'}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
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
