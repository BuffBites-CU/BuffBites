'use client'

import { FireIcon } from './icons'
import Avatar from './Avatar'
import Doodle, { doodleFor } from './Doodle'
import { DINING_HALL_LABELS } from '@/types'
import type { CommunityCombo } from '@/types'
import { parseApiDate } from '@/lib/date'

export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - parseApiDate(iso).getTime()) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

/** Kept for existing imports: the hand-drawn avatar for a student. */
export function StudentAvatar({ name, size = 36 }: { name: string; size?: number }) {
  return <Avatar name={name} size={size} />
}

interface Props {
  combo: CommunityCombo
  rank?: number
  onClick: () => void
  /** Compact = square tile for the horizontal rail on Discover. */
  variant?: 'feed' | 'compact'
}

/**
 * A student's combo as a minimal white card: a line-art doodle of the dish,
 * the student's hand-drawn avatar and handle, and its vote count (the number
 * the feed is ranked by).
 */
export default function TrendingPost({ combo, rank, onClick, variant = 'feed' }: Props) {
  const hall = DINING_HALL_LABELS[combo.dining_hall] ?? combo.dining_hall
  const doodle = doodleFor(combo.title, ...combo.dishes.map((d) => `${d.station} ${d.name}`))
  const votes = combo.upvotes

  if (variant === 'compact') {
    return (
      <button onClick={onClick} className="card card-press relative w-[150px] flex-shrink-0 p-3 text-left">
        {rank !== undefined && rank <= 3 && (
          <span className="absolute top-2 left-2.5 plan-label !text-brand-black">No. 0{rank}</span>
        )}
        <div className="flex h-[92px] items-center justify-center text-brand-black">
          <Doodle name={doodle} size={78} />
        </div>
        <p className="mt-1 font-display text-[17px] leading-tight text-brand-black line-clamp-2 min-h-[2.4em]">{combo.title}</p>
        <div className="mt-2 flex items-center gap-1.5">
          <Avatar name={combo.author_username} size={22} />
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted">@{combo.author_username}</span>
          <span className="flex items-center gap-0.5 text-[12px] font-semibold text-brand-deep">
            <FireIcon width={13} height={13} />{votes}
          </span>
        </div>
      </button>
    )
  }

  return (
    <button onClick={onClick} className="card card-press relative w-full p-4 text-left animate-pop-in">
      <div className="flex items-center gap-2.5">
        <Avatar name={combo.author_username} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-brand-black">@{combo.author_username}</p>
          <p className="truncate text-[12px] text-muted">{hall} · {timeAgo(combo.created_at)}</p>
        </div>
        {rank !== undefined && <span className="plan-label !text-brand-black">No. {String(rank).padStart(2, '0')}</span>}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-display text-[21px] leading-tight text-brand-black">{combo.title}</p>
          {combo.description && <p className="mt-1 text-[13px] text-muted line-clamp-2">{combo.description}</p>}
        </div>
        <Doodle name={doodle} size={64} className="flex-shrink-0 text-brand-black" />
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {combo.dishes.slice(0, 4).map((d, i) => (
          <span key={`${i}-${d.name}`} className="max-w-full truncate rounded-full bg-surface-overlay px-2.5 py-0.5 text-[12px] text-brand-black">
            {d.name}
          </span>
        ))}
        {combo.dishes.length > 4 && <span className="px-1 py-0.5 text-[12px] text-muted">+{combo.dishes.length - 4}</span>}
      </div>

      <div className="mt-2.5 flex items-center gap-1 text-brand-deep">
        <FireIcon width={16} height={16} />
        <span className="text-[14px] font-semibold">{votes}</span>
        <span className="ml-0.5 text-[12px] text-muted">{votes === 1 ? 'vote' : 'votes'}</span>
      </div>
    </button>
  )
}
