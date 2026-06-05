'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { XMarkIcon } from './icons'

const SEEN_KEY = 'buffbites_install_prompt_seen'
const OPEN_EVENT = 'buffbites:open-install'
const DURATION = 5 // seconds, auto-show only

type Platform = 'ios' | 'android'

/** Open the install guide from anywhere (e.g. a header button). */
export function openInstallGuide() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/** Detect mobile platform; returns null on desktop / already-installed. */
function detectPlatform(): Platform | null {
  if (typeof window === 'undefined') return null

  // Already running as an installed app — nothing to teach.
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari exposes this non-standard flag.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  if (standalone) return null

  const ua = window.navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  // iPadOS 13+ reports as Mac but has touch.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'ios'
  return null
}

const COPY: Record<Platform, { device: string; steps: { icon: string; text: string }[] }> = {
  ios: {
    device: 'iPhone',
    steps: [
      { icon: '1', text: 'Tap the Share button (⬆️) in Safari\'s toolbar' },
      { icon: '2', text: 'Scroll down and choose “Add to Home Screen”' },
      { icon: '3', text: 'Tap “Add” — BuffBites lands on your home screen' },
    ],
  },
  android: {
    device: 'Android',
    steps: [
      { icon: '1', text: 'Tap the menu (⋮) in Chrome\'s top-right' },
      { icon: '2', text: 'Choose “Add to Home screen” or “Install app”' },
      { icon: '3', text: 'Confirm — BuffBites lands on your home screen' },
    ],
  },
}

type Mode = 'closed' | 'auto' | 'manual'

export default function InstallPrompt() {
  const [mode, setMode] = useState<Mode>('closed')
  const [platform, setPlatform] = useState<Platform>('ios')
  const [remaining, setRemaining] = useState(DURATION)

  // Auto-show once on mobile; manual open via the global event anywhere.
  useEffect(() => {
    const openManual = () => {
      setPlatform((p) => detectPlatform() ?? p)
      setRemaining(0)
      setMode('manual')
    }
    window.addEventListener(OPEN_EVENT, openManual)

    let seen = false
    try {
      seen = !!localStorage.getItem(SEEN_KEY)
    } catch {
      /* private mode — just proceed */
    }
    if (!seen) {
      const p = detectPlatform()
      if (p) {
        setPlatform(p)
        setRemaining(DURATION)
        setMode('auto')
      }
    }
    return () => window.removeEventListener(OPEN_EVENT, openManual)
  }, [])

  // Countdown + auto-dismiss (auto mode only).
  useEffect(() => {
    if (mode !== 'auto') return
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* ignore */
    }
    const tick = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(tick)
          setMode('closed')
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [mode])

  if (mode === 'closed') return null

  const copy = COPY[platform]
  const progress = (remaining / DURATION) * 100

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-brand-black/95 px-6 text-center backdrop-blur-sm">
      {/* Dismiss */}
      <button
        onClick={() => setMode('closed')}
        aria-label="Dismiss"
        className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20"
      >
        <XMarkIcon className="h-5 w-5" />
      </button>

      <div className="flex w-full max-w-sm flex-col items-center">
        <div className="mb-5 overflow-hidden rounded-2xl shadow-lg ring-1 ring-white/15">
          <Image src="/logoi.jpeg" alt="BuffBites" width={72} height={72} priority />
        </div>

        <h1 className="font-sans text-2xl font-bold text-white">
          Add BuffBites to your {copy.device}
        </h1>
        <p className="mt-2 text-sm text-white/60">
          Install it like an app — one tap from your home screen, no browser needed.
        </p>

        {/* Platform toggle — lets anyone view either guide */}
        <div className="mt-5 inline-flex rounded-full bg-white/10 p-1">
          {(['ios', 'android'] as Platform[]).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                platform === p ? 'bg-brand-gold text-brand-black' : 'text-white/70'
              }`}
            >
              {COPY[p].device}
            </button>
          ))}
        </div>

        <ol className="mt-6 w-full space-y-3 text-left">
          {copy.steps.map((step, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/10"
            >
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-gold text-base font-semibold text-brand-black">
                {step.icon}
              </span>
              <span className="text-sm leading-snug text-white/90">{step.text}</span>
            </li>
          ))}
        </ol>

        <button
          onClick={() => setMode('closed')}
          className="mt-7 w-full rounded-xl bg-brand-gold py-3 text-sm font-semibold text-brand-black transition active:scale-[0.98]"
        >
          Got it{mode === 'auto' && remaining > 0 ? ` (${remaining})` : ''}
        </button>

        {/* Auto-dismiss progress bar */}
        {mode === 'auto' && (
          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-brand-gold transition-[width] duration-1000 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
