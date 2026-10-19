'use client'

import type { DiningTable } from '@/types'
import Avatar from '../Avatar'

interface Props {
  table: DiningTable
  labels: Record<string, string>
  busy: boolean
  onJoin: () => void
  onLeave: () => void
  onChat: () => void
}

function to12h(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

/** One open table: where and when, who's there, shared interests, and the action. */
export default function TableCard({ table: t, labels, busy, onJoin, onLeave, onChat }: Props) {
  const inside = t.hosting || t.joined
  return (
    <article className={`card p-3.5 ${inside ? 'hatch' : ''}`} aria-label={`Table at ${t.hall}, hosted by ${t.host}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="plan-label !text-brand-black">{t.hall} · {t.period}</span>
        <span className="font-mono text-[12px] text-brand-black">{t.time ? to12h(t.time) : 'Anytime'}</span>
      </div>

      <div className="mt-2 flex items-center gap-2.5">
        <div className="flex -space-x-2">
          {t.members.slice(0, 4).map((m) => <Avatar key={m} name={m} size={30} className="ring-2 ring-surface" />)}
        </div>
        <p className="min-w-0 flex-1 text-[13px] text-brand-black truncate">
          {t.hosting ? 'You’re hosting' : <><b>@{t.host}</b>{t.members.length > 1 ? ` +${t.members.length - 1}` : ''}</>}
        </p>
        {/* Seats as a little floor plan: filled = taken, outlined = open */}
        <div className="flex gap-1" aria-label={`${t.open_seats} of ${t.seats} seats open`}>
          {Array.from({ length: t.seats }, (_, i) => (
            <span key={i} className={`h-3.5 w-3.5 rounded-[2px] ring-[1.5px] ring-brand-black ${i < t.seats - t.open_seats ? 'bg-brand-black' : 'bg-surface'}`} />
          ))}
        </div>
      </div>

      {t.note && <p className="mt-2 text-[13px] text-brand-black leading-snug">&ldquo;{t.note}&rdquo;</p>}

      {t.interests.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {t.interests.map((k) => {
            const shared = t.shared.includes(k)
            return (
              <span key={k} className={`rounded-md px-2 py-0.5 text-[12px] ring-[1.5px] ring-brand-black ${shared ? 'bg-brand-black text-white' : 'text-brand-black'}`}>
                {labels[k] ?? k}
              </span>
            )
          })}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-muted">
          {t.shared.length > 0 ? `${t.shared.length} in common` : inside ? `${t.members.length} at the table` : 'New people'}
        </span>
        {inside ? (
          <div className="flex gap-2">
            <button onClick={onLeave} disabled={busy} className="rounded-lg px-3 py-2 text-[13px] font-semibold text-brand-black ring-[1.5px] ring-brand-black disabled:opacity-50">
              {t.hosting ? 'Close' : 'Leave'}
            </button>
            <button onClick={onChat} className="rounded-lg bg-brand-black px-4 py-2 text-[13px] font-semibold text-white card-press">Chat</button>
          </div>
        ) : t.open_seats > 0 ? (
          <button onClick={onJoin} disabled={busy} className="rounded-lg bg-brand-black px-4 py-2 text-[13px] font-semibold text-white card-press disabled:opacity-50">
            {busy ? 'Joining…' : 'Join'}
          </button>
        ) : (
          <span className="font-mono text-[11px] uppercase tracking-wider text-brand-black">Full</span>
        )}
      </div>
    </article>
  )
}
