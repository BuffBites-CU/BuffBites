'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { startStravaConnect } from '@/services/coachService'
import Doodle from './Doodle'
import { XMarkIcon } from './icons'

const TERMS: Array<{ no: string; title: string; body: string }> = [
  {
    no: '01',
    title: 'What we read',
    body:
      'Your Strava activities from the last 7 days: sport, start time, duration, distance, climb and power-meter work. ' +
      'Your Strava weight and sex, if you set them. Never your routes, maps, photos or followers.',
  },
  {
    no: '02',
    title: 'What we do with it',
    body:
      "We estimate what you burned and set today's calorie and macro target. When you tap Build my plan, a short " +
      "summary (sport, minutes, distance, calories, no names or maps) goes to Anthropic's Claude to pick meals from the menu.",
  },
  {
    no: '03',
    title: 'What we keep',
    body:
      'Your Strava sign-in, encrypted, and your first name. Workouts are read when needed and never saved. ' +
      'Plans are kept for 6 hours so reopening the app is free.',
  },
  {
    no: '04',
    title: "You're in control",
    body: 'Disconnect any time in Profile. We revoke access at Strava and delete everything above.',
  },
]

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * The consent sheet shown before any Strava connection. Nothing is requested
 * from Strava until the student ticks the box and continues; the server also
 * refuses to start the link without that explicit consent.
 */
export default function StravaConsent({ open, onClose }: Props) {
  const { firebaseUser } = useAuth()
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mounted, setMounted] = useState(false)

  const closeRef = useRef(onClose)

  useEffect(() => setMounted(true), [])
  useEffect(() => { closeRef.current = onClose })

  // Fresh sheet every time it opens; a parent re-render must not untick the box.
  useEffect(() => {
    if (!open) return
    setAgreed(false)
    setBusy(false)
    setError('')
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function connect() {
    if (!agreed || !firebaseUser || busy) return
    setBusy(true)
    setError('')
    try {
      const { url } = await startStravaConnect(await firebaseUser.getIdToken())
      window.location.assign(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the Strava link.')
      setBusy(false)
    }
  }

  if (!open || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-brand-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="strava-consent-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto overscroll-contain bg-surface rounded-t-[28px] shadow-soft-lg p-4 animate-page-in"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="plan-label">Permission · read only</span>
            <h2 id="strava-consent-title" className="text-[28px] text-brand-black leading-none mt-1">Link Strava?</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-10 h-10 -mr-2 flex items-center justify-center rounded-full hover:bg-surface-overlay">
            <XMarkIcon width={20} height={20} />
          </button>
        </div>
        <div className="dim-line mt-2 mb-3" aria-hidden />

        <div className="flex items-center gap-3 mb-3">
          <Doodle name="shoe" size={56} className="text-brand-black flex-shrink-0" />
          <p className="text-[13px] text-brand-black">
            Your workouts set how much you should eat today, and the fuel coach builds that day from your hall&apos;s menu.
          </p>
        </div>

        <ol className="space-y-2.5">
          {TERMS.map((t) => (
            <li key={t.no} className="card px-3.5 py-3">
              <span className="plan-label !text-brand-black">{t.no} · {t.title}</span>
              <p className="text-[13px] text-brand-black mt-1 leading-snug">{t.body}</p>
            </li>
          ))}
        </ol>

        <label className="mt-4 flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-5 w-5 flex-shrink-0 accent-brand-black"
          />
          <span className="text-[13px] text-brand-black">
            I agree to let BuffBites read my Strava activities and use them as described above.
          </span>
        </label>

        {error && <p className="mt-3 text-[13px] text-brand-black font-semibold" role="alert">{error}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button onClick={onClose} className="card card-press py-3 font-display text-[18px] text-brand-black">
            Not now
          </button>
          <button
            onClick={connect}
            disabled={!agreed || busy}
            className="rounded-xl bg-brand-black py-3 font-display text-[18px] text-white card-press disabled:opacity-40"
          >
            {busy ? 'Opening…' : 'Continue to Strava'}
          </button>
        </div>
        <p className="mt-3 text-[11px] text-muted text-center">
          Estimates for everyday eating, not medical advice.{' '}
          <Link href="/fuel-info" className="underline underline-offset-2">How it works</Link>
        </p>
      </div>
    </div>,
    document.body,
  )
}
