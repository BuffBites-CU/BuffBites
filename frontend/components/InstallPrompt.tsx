'use client'

import { useEffect, useState } from 'react'
import { XMarkIcon } from './icons'
import InstallAnimation, { type InstallPlatform } from './InstallAnimation'

const SEEN_KEY = 'buffbites_install_prompt_seen'
const OPEN_EVENT = 'buffbites:open-install'
const DURATION = 5 // seconds: one loop of the animation, auto-show only

/** Open the install guide from anywhere (e.g. a header button). */
export function openInstallGuide() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/** Chrome's install event (not in the TS DOM lib yet). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari exposes this non-standard flag.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Detect mobile platform; returns null on desktop / already-installed. */
function detectPlatform(): InstallPlatform | null {
  if (typeof window === 'undefined' || isStandalone()) return null
  const ua = window.navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  // iPadOS 13+ reports as Mac but has touch.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'ios'
  return null
}

type Mode = 'closed' | 'auto' | 'manual'

export default function InstallPrompt() {
  const [mode, setMode] = useState<Mode>('closed')
  const [platform, setPlatform] = useState<InstallPlatform>('ios')
  const [remaining, setRemaining] = useState(DURATION)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)

  // Android/Chrome can install in one tap; keep the event for the button.
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => { setInstallEvent(null); setMode('closed') }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

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
      /* private mode: just proceed */
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

  // Auto mode plays the 5 s animation once, then closes.
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

  // Escape closes it.
  useEffect(() => {
    if (mode === 'closed') return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMode('closed') }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  async function installNow() {
    if (!installEvent) return
    await installEvent.prompt()
    await installEvent.userChoice.catch(() => null)
    setInstallEvent(null)
  }

  if (mode === 'closed') return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-title"
      onClick={() => setMode('closed')}
    >
      <div
        className="relative w-full max-w-sm rounded-t-[32px] sm:rounded-[32px] bg-surface px-5 pt-6 shadow-soft-lg animate-page-in"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setMode('closed')}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-surface-card text-muted shadow-soft"
        >
          <XMarkIcon width={18} height={18} />
        </button>

        <h2 id="install-title" className="pr-10 text-[30px] leading-none text-brand-black">Add BuffBites to your home screen</h2>
        <p className="mt-2 text-[14px] text-muted">Opens like an app, one tap away. Takes 5 seconds:</p>

        <div className="mt-4 mb-4 inline-flex rounded-full bg-surface-card p-1 shadow-soft" role="tablist" aria-label="Phone type">
          {(['ios', 'android'] as InstallPlatform[]).map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={platform === p}
              onClick={() => setPlatform(p)}
              className={`rounded-full px-4 py-1.5 font-display text-[16px] transition-colors ${
                platform === p ? 'bg-brand text-white' : 'text-muted'
              }`}
            >
              {p === 'ios' ? 'iPhone' : 'Android'}
            </button>
          ))}
        </div>

        <InstallAnimation platform={platform} />

        {platform === 'android' && installEvent ? (
          <button
            onClick={installNow}
            className="mt-5 w-full rounded-2xl bg-brand py-3.5 font-display text-[20px] text-white card-press"
          >
            Install now
          </button>
        ) : (
          <button
            onClick={() => setMode('closed')}
            className="mt-5 w-full rounded-2xl bg-brand-black py-3.5 font-display text-[20px] text-white card-press"
          >
            Got it{mode === 'auto' && remaining > 0 ? ` (${remaining})` : ''}
          </button>
        )}
      </div>
    </div>
  )
}
