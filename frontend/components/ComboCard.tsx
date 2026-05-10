'use client'

import { ClockIcon, ChevronUpIcon } from './icons'
import type { ComboTag, DiningHall } from '@/types'
import { DINING_HALL_LABELS } from '@/types'

const TAG_STYLES: Record<string, string> = {
  vegan: 'bg-emerald-100 text-emerald-800',
  vegetarian: 'bg-green-100 text-green-800',
  'gluten-free': 'bg-yellow-100 text-yellow-800',
  halal: 'bg-indigo-100 text-indigo-800',
  'high-protein': 'bg-blue-100 text-blue-800',
  light: 'bg-sky-100 text-sky-800',
  hearty: 'bg-red-100 text-red-800',
  balanced: 'bg-teal-100 text-teal-800',
  'low-carb': 'bg-orange-100 text-orange-800',
  'high-fiber': 'bg-lime-100 text-lime-800',
  'low-calorie': 'bg-cyan-100 text-cyan-800',
  'comfort-food': 'bg-amber-100 text-amber-800',
  'omega-3': 'bg-violet-100 text-violet-800',
  'high-carb': 'bg-rose-100 text-rose-800',
}

function tagStyle(tag: string) {
  return TAG_STYLES[tag] ?? 'bg-gray-100 text-gray-700'
}

function formatExpiry(iso: string): { text: string; urgent: boolean } {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return { text: 'Expired', urgent: true }
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const urgent = h < 1
  return {
    text: h > 0 ? `${h}h ${m}m left` : `${m}m left`,
    urgent,
  }
}

interface Props {
  title: string
  description: string
  tags: ComboTag[]
  approximate_calories?: number
  upvotes?: number
  author_username?: string
  dining_hall?: DiningHall
  expires_at?: string
  rank?: number
  onClick: () => void
}

export default function ComboCard({
  title,
  description,
  tags,
  approximate_calories,
  upvotes,
  author_username,
  dining_hall,
  expires_at,
  rank,
  onClick,
}: Props) {
  const expiry = expires_at ? formatExpiry(expires_at) : null

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl shadow-sm border border-gray-100 p-4 transition-all duration-150 hover:shadow-md hover:scale-[1.01] active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {rank !== undefined && (
            <span className="flex-shrink-0 text-lg font-bold text-brand-black w-7 text-center">
              {rank}
            </span>
          )}
          <h3 className="font-semibold text-brand-black text-sm leading-snug line-clamp-1">
            {title}
          </h3>
        </div>

        <div className="flex-shrink-0">
          {upvotes !== undefined ? (
            <span className="flex items-center gap-1 text-xs text-brand-gold font-medium">
              <ChevronUpIcon width={14} height={14} />
              {upvotes}
            </span>
          ) : approximate_calories !== undefined ? (
            <span className="text-xs text-muted">~{approximate_calories} cal</span>
          ) : null}
        </div>
      </div>

      <p className="text-sm text-muted line-clamp-2 mb-3 leading-relaxed">{description}</p>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tagStyle(tag)}`}
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="flex-shrink-0">
          {author_username ? (
            <span className="text-xs text-muted">@{author_username}</span>
          ) : dining_hall ? (
            <span className="rounded-full bg-gray-100 text-muted text-[10px] px-2 py-0.5">
              {DINING_HALL_LABELS[dining_hall]}
            </span>
          ) : null}
        </div>
      </div>

      {expiry && (
        <div className={`flex items-center gap-1 mt-2 text-[11px] ${expiry.urgent ? 'text-orange-500' : 'text-muted'}`}>
          <ClockIcon width={12} height={12} />
          {expiry.text}
        </div>
      )}
    </button>
  )
}

export { tagStyle }
