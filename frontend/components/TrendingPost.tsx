'use client'

import { FireIcon } from './icons'
import { DINING_HALL_LABELS } from '@/types'
import type { CommunityCombo } from '@/types'
import { parseApiDate } from '@/lib/date'

// Deterministic avatar color per username so the same student is always the same color.
const AVATAR_COLORS = [
  'bg-brand text-brand-black',
  'bg-brand-black text-brand',
  'bg-brand-gold text-brand-black',
  'bg-brand-hot text-white',
  'bg-brand-pale text-brand-black',
]

function avatarClass(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - parseApiDate(iso).getTime()) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function StudentAvatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-display font-bold flex-shrink-0 ring-2 ring-surface-card ${avatarClass(name)}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {(name[0] ?? '?').toUpperCase()}
    </span>
  )
}

interface Props {
  combo: CommunityCombo
  rank?: number
  onClick: () => void
  /** Compact = fixed-width card for the horizontal rail on Discover. */
  variant?: 'feed' | 'compact'
}

/**
 * A combo rendered as a social post: who made it, where, and how hot it is.
 * Students' usernames lead the card so trending meals read as "@maya's Power Bowl".
 */
export default function TrendingPost({ combo, rank, onClick, variant = 'feed' }: Props) {
  const hall = DINING_HALL_LABELS[combo.dining_hall] ?? combo.dining_hall
  // Same number the feed is ranked by, so #1 never shows fewer votes than #2.
  const score = combo.upvotes
  const compact = variant === 'compact'

  return (
    <button
      onClick={onClick}
      className={`relative text-left bg-surface-card rounded-2xl border-2 border-brand-black shadow-sticker transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${
        compact ? 'w-[220px] flex-shrink-0 p-3' : 'w-full p-4'
      }`}
    >
      {rank !== undefined && rank <= 3 && (
        <span
          className="absolute -top-3 -right-2 bg-brand-hot text-white font-brush text-sm px-2.5 py-0.5 rounded-full border-2 border-brand-black animate-wiggle"
          aria-label={`Rank ${rank}`}
        >
          #{rank}
        </span>
      )}

      <div className="flex items-center gap-2">
        <StudentAvatar name={combo.author_username} size={compact ? 28 : 36} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-brand-black truncate">@{combo.author_username}</p>
          <p className="text-[11px] text-muted truncate">
            {hall} · {timeAgo(combo.created_at)}
          </p>
        </div>
        {rank !== undefined && rank > 3 && (
          <span className="font-display text-xs font-bold text-muted">#{rank}</span>
        )}
      </div>

      <p className={`mt-2.5 font-display font-bold text-brand-black leading-tight ${compact ? 'text-sm line-clamp-2' : 'text-base'}`}>
        {combo.title}
      </p>

      {!compact && combo.description && (
        <p className="mt-1 text-[13px] text-muted line-clamp-2">{combo.description}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        {combo.dishes.slice(0, compact ? 2 : 4).map((d) => (
          <span key={d.name} className="text-[11px] bg-surface-overlay text-brand-black rounded-full px-2 py-0.5 max-w-full truncate">
            {d.name}
          </span>
        ))}
        {combo.dishes.length > (compact ? 2 : 4) && (
          <span className="text-[11px] text-muted px-1 py-0.5">+{combo.dishes.length - (compact ? 2 : 4)}</span>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-1 text-brand-deep">
        <FireIcon width={15} height={15} />
        <span className="text-[13px] font-bold">{score}</span>
        <span className="text-[11px] text-muted ml-0.5">{score === 1 ? 'vote' : 'votes'}</span>
      </div>
    </button>
  )
}
