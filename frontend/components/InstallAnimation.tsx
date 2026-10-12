'use client'

/**
 * A 5-second looping phone demo of "Add to Home Screen".
 *
 * One CSS timeline drives everything (finger, sheet/menu, confirm dialog, home
 * screen and captions), so the steps stay in sync. Timeline (5 s):
 *   0.0–1.0 s  tap Share (iOS) / ⋮ (Android)
 *   1.0–2.3 s  sheet/menu opens, tap "Add to Home Screen"
 *   2.3–3.7 s  confirm dialog, tap "Add"
 *   3.7–5.0 s  home screen: the BuffBites icon pops in
 * With prefers-reduced-motion the phone is hidden and the steps show as a list.
 */

import Image from 'next/image'

export type InstallPlatform = 'ios' | 'android'

const STEPS: Record<InstallPlatform, string[]> = {
  ios: ['Tap Share in Safari', 'Choose “Add to Home Screen”', 'Tap “Add”', 'Open BuffBites from your home screen'],
  android: ['Tap ⋮ in Chrome', 'Choose “Add to Home screen”', 'Tap “Add”', 'Open BuffBites from your home screen'],
}

// Where the finger taps, as % of the phone screen.
const TAPS: Record<InstallPlatform, Record<string, string>> = {
  ios: { '--t1x': '50%', '--t1y': '93%', '--t2x': '42%', '--t2y': '92%', '--t3x': '87%', '--t3y': '27%' },
  android: { '--t1x': '90%', '--t1y': '6%', '--t2x': '62%', '--t2y': '37.5%', '--t3x': '82%', '--t3y': '61%' },
}

const CSS = `
.ia-loop { animation-duration: 5s; animation-iteration-count: infinite; animation-timing-function: ease-in-out; animation-fill-mode: both; }

@keyframes ia-finger {
  0%   { left: 50%; top: 62%; opacity: 0; transform: translate(-50%,-50%) scale(1); }
  6%   { opacity: 1; }
  14%  { left: var(--t1x); top: var(--t1y); transform: translate(-50%,-50%) scale(1); }
  18%  { left: var(--t1x); top: var(--t1y); transform: translate(-50%,-50%) scale(.78); }
  21%  { left: var(--t1x); top: var(--t1y); transform: translate(-50%,-50%) scale(1); }
  34%  { left: var(--t2x); top: var(--t2y); transform: translate(-50%,-50%) scale(1); }
  40%  { left: var(--t2x); top: var(--t2y); transform: translate(-50%,-50%) scale(.78); }
  43%  { left: var(--t2x); top: var(--t2y); transform: translate(-50%,-50%) scale(1); }
  58%  { left: var(--t3x); top: var(--t3y); transform: translate(-50%,-50%) scale(1); }
  64%  { left: var(--t3x); top: var(--t3y); transform: translate(-50%,-50%) scale(.78); opacity: 1; }
  68%  { left: var(--t3x); top: var(--t3y); transform: translate(-50%,-50%) scale(1); opacity: 0; }
  100% { left: var(--t3x); top: var(--t3y); opacity: 0; }
}
@keyframes ia-browser { 0%, 72% { opacity: 1; } 75%, 97% { opacity: 0; } 100% { opacity: 1; } }
@keyframes ia-dim     { 0%, 46% { opacity: 0; } 50%, 71% { opacity: 1; } 75%, 100% { opacity: 0; } }
@keyframes ia-sheet   { 0%, 19% { transform: translateY(105%); } 25%, 45% { transform: translateY(0); } 49%, 100% { transform: translateY(105%); } }
@keyframes ia-menu    { 0%, 19% { opacity: 0; transform: scale(.85); } 24%, 45% { opacity: 1; transform: scale(1); } 48%, 100% { opacity: 0; transform: scale(.85); } }
@keyframes ia-row     { 0%, 33% { background: transparent; } 36%, 46% { background: rgb(var(--brand) / .22); } 49%, 100% { background: transparent; } }
@keyframes ia-dialog  { 0%, 47% { opacity: 0; transform: translateY(8px); } 51%, 71% { opacity: 1; transform: none; } 75%, 100% { opacity: 0; } }
@keyframes ia-addbtn  { 0%, 61% { background: transparent; } 63%, 70% { background: rgb(var(--brand) / .25); } 72%, 100% { background: transparent; } }
@keyframes ia-home    { 0%, 72% { opacity: 0; } 76%, 96% { opacity: 1; } 100% { opacity: 0; } }
@keyframes ia-newicon { 0%, 78% { transform: scale(0); } 84% { transform: scale(1.18); } 88%, 100% { transform: scale(1); } }
@keyframes ia-spark   { 0%, 82% { opacity: 0; transform: scale(.4); } 86% { opacity: 1; transform: scale(1.1); } 94%, 100% { opacity: 0; transform: scale(1.3); } }
@keyframes ia-step1   { 0%, 20% { opacity: 1; } 24%, 100% { opacity: .35; } }
@keyframes ia-step2   { 0%, 20% { opacity: .35; } 24%, 46% { opacity: 1; } 50%, 100% { opacity: .35; } }
@keyframes ia-step3   { 0%, 46% { opacity: .35; } 50%, 72% { opacity: 1; } 76%, 100% { opacity: .35; } }
@keyframes ia-step4   { 0%, 72% { opacity: .35; } 76%, 100% { opacity: 1; } }
@keyframes ia-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }

.ia-finger  { animation-name: ia-finger; }
.ia-browser { animation-name: ia-browser; }
.ia-dim     { animation-name: ia-dim; }
.ia-sheet   { animation-name: ia-sheet; }
.ia-menu    { animation-name: ia-menu; transform-origin: 92% 0; }
.ia-row     { animation-name: ia-row; }
.ia-dialog  { animation-name: ia-dialog; }
.ia-addbtn  { animation-name: ia-addbtn; }
.ia-home    { animation-name: ia-home; }
.ia-newicon { animation-name: ia-newicon; animation-timing-function: cubic-bezier(.34,1.56,.64,1); }
.ia-spark   { animation-name: ia-spark; }
.ia-step-0  { animation-name: ia-step1; }
.ia-step-1  { animation-name: ia-step2; }
.ia-step-2  { animation-name: ia-step3; }
.ia-step-3  { animation-name: ia-step4; }
.ia-progress { animation: ia-progress 5s linear infinite; transform-origin: left; }

@media (prefers-reduced-motion: reduce) {
  .ia-phone, .ia-progress-track { display: none; }
  .ia-steps li { opacity: 1 !important; animation: none !important; }
}
`

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12M8 7l4-4 4 4" /><path d="M6 11v9h12v-9" />
    </svg>
  )
}

function PlusSquare() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" />
    </svg>
  )
}

/** A miniature BuffBites page shown inside the phone's browser. */
function MiniPage() {
  return (
    <div className="absolute inset-x-0 top-[10%] bottom-[12%] bg-surface px-2.5 pt-2">
      <div className="flex items-center gap-1">
        <div className="h-3.5 w-3.5 rounded-md bg-brand" />
        <div className="font-display text-[10px] text-brand-black">Buff Bites</div>
      </div>
      <div className="mt-2 h-10 rounded-xl bg-brand-black" />
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 rounded-xl bg-white shadow-soft" />)}
      </div>
    </div>
  )
}

export default function InstallAnimation({ platform }: { platform: InstallPlatform }) {
  const ios = platform === 'ios'
  const steps = STEPS[platform]

  return (
    <div className="flex flex-col items-center">
      <style>{CSS}</style>

      {/* Phone (key resets the timeline when switching platform) */}
      <div
        key={platform}
        className="ia-phone relative h-[330px] w-[168px] rounded-[30px] bg-brand-black p-[7px] shadow-soft-lg"
        aria-hidden
      >
        <div className="relative h-full w-full overflow-hidden rounded-[24px] bg-white" style={TAPS[platform] as React.CSSProperties}>
          {/* Browser view */}
          <div className="ia-loop ia-browser absolute inset-0">
            {ios ? (
              <>
                <div className="absolute inset-x-0 top-0 h-[10%] bg-surface-overlay flex items-end justify-center pb-1">
                  <div className="h-3 w-24 rounded-full bg-white text-[7px] text-muted flex items-center justify-center">buffbites.app</div>
                </div>
                <MiniPage />
                <div className="absolute inset-x-0 bottom-0 h-[12%] bg-surface-overlay flex items-center justify-around text-brand-black/70">
                  <span className="text-[10px]">‹</span><span className="text-[10px]">›</span>
                  <span className="text-brand-black"><ShareIcon /></span>
                  <span className="text-[9px]">▢</span><span className="text-[9px]">⧉</span>
                </div>
              </>
            ) : (
              <>
                <div className="absolute inset-x-0 top-0 h-[10%] bg-surface-overlay flex items-center gap-1 px-2">
                  <div className="h-3.5 flex-1 rounded-full bg-white text-[7px] text-muted flex items-center px-1.5">buffbites.app</div>
                  <span className="text-[12px] leading-none text-brand-black font-bold">⋮</span>
                </div>
                <MiniPage />
              </>
            )}
          </div>

          {/* iOS share sheet / Android menu */}
          {ios ? (
            <div className="ia-loop ia-sheet absolute inset-x-0 bottom-0 h-[42%] rounded-t-2xl bg-white shadow-soft-lg px-2.5 pt-2">
              <div className="mx-auto mb-1.5 h-1 w-8 rounded-full bg-stone-300" />
              {['Copy', 'Add to Reading List', 'Add Bookmark'].map((r) => (
                <div key={r} className="py-1.5 text-[9px] text-brand-black border-b border-surface-overlay">{r}</div>
              ))}
              <div className="ia-loop ia-row -mx-1 px-1 rounded-lg py-1.5 text-[9px] font-semibold text-brand-black flex items-center justify-between">
                Add to Home Screen <PlusSquare />
              </div>
            </div>
          ) : (
            <div className="ia-loop ia-menu absolute right-1.5 top-[7%] w-[70%] rounded-xl bg-white shadow-soft-lg py-1">
              {['New tab', 'Bookmarks', 'Downloads'].map((r) => (
                <div key={r} className="px-2.5 py-1.5 text-[9px] text-brand-black">{r}</div>
              ))}
              <div className="ia-loop ia-row px-2.5 py-1.5 text-[9px] font-semibold text-brand-black">Add to Home screen</div>
              <div className="px-2.5 py-1.5 text-[9px] text-brand-black">Settings</div>
            </div>
          )}

          <div className="ia-loop ia-dim absolute inset-0 bg-brand-black/35" />

          {/* Confirm dialog */}
          <div className={`ia-loop ia-dialog absolute inset-x-2 rounded-2xl bg-white shadow-soft-lg p-2.5 ${ios ? 'top-[22%]' : 'top-[34%]'}`}>
            <div className="flex items-center justify-between gap-1 whitespace-nowrap text-[8px]">
              <span className="text-muted">Cancel</span>
              <span className="font-semibold text-brand-black">Add to Home Screen</span>
              <span className={`ia-loop ia-addbtn rounded-md px-1 font-semibold text-brand-deep ${ios ? '' : 'invisible'}`}>Add</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Image src="/logoi.jpeg" alt="" width={28} height={28} className="rounded-lg" />
              <span className="text-[10px] text-brand-black">BuffBites</span>
            </div>
            {!ios && (
              <div className="mt-2 flex justify-end">
                <span className="ia-loop ia-addbtn rounded-md px-2 py-0.5 text-[9px] font-semibold text-brand-deep">Add</span>
              </div>
            )}
          </div>

          {/* Home screen */}
          <div className="ia-loop ia-home absolute inset-0 bg-gradient-to-b from-[#FFD9C6] to-[#FFF1EA] px-3 pt-8">
            <div className="grid grid-cols-4 gap-x-2 gap-y-3">
              {Array.from({ length: 11 }, (_, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <div className="h-7 w-7 rounded-lg bg-white/70" />
                  <div className="h-1 w-5 rounded bg-white/70" />
                </div>
              ))}
              <div className="relative flex flex-col items-center gap-0.5">
                <div className="ia-loop ia-newicon h-7 w-7 overflow-hidden rounded-lg shadow-soft">
                  <Image src="/logoi.jpeg" alt="" width={28} height={28} />
                </div>
                <span className="text-[6px] leading-none text-brand-black">BuffBites</span>
                <span className="ia-loop ia-spark absolute -right-1.5 -top-1.5 text-[10px]">✨</span>
              </div>
            </div>
          </div>

          {/* Finger */}
          <div className="ia-loop ia-finger pointer-events-none absolute text-[22px] leading-none drop-shadow">👆</div>
        </div>
      </div>

      {/* 5 s progress, then steps synced to the timeline */}
      <div className="ia-progress-track mt-4 h-1 w-[168px] overflow-hidden rounded-full bg-surface-overlay" aria-hidden>
        <div key={platform} className="ia-progress h-full w-full rounded-full bg-brand" />
      </div>
      <ol key={`steps-${platform}`} className="ia-steps mt-4 w-full space-y-1.5">
        {steps.map((text, i) => (
          <li key={i} className={`ia-loop ia-step-${i} flex items-center gap-2.5`}>
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand font-display text-[15px] text-brand-black">{i + 1}</span>
            <span className="text-[14px] text-brand-black">{text}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
