'use client'

import { ClockIcon, ChevronUpIcon } from './icons'
import type { ComboTag } from '@/types'

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

function formatExpiry(iso: string): { text: string; level: 'normal' | 'amber' | 'red' } {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return { text: 'Expired', level: 'red' }
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return {
    text: h > 0 ? `${h}h ${m}m left` : `${m}m left`,
    level: h < 4 ? 'red' : h < 12 ? 'amber' : 'normal',
  }
}

const EXPIRY_CLASS = {
  normal: 'text-muted',
  amber: 'text-amber-500',
  red: 'text-red-500',
}

interface Props {
  title: string
  description: string
  tags: ComboTag[]
  dishes?: Array<{ name: string }>
  approximate_calories?: number
  upvotes?: number
  hasVoted?: boolean
  onUpvote?: () => void
  expires_at?: string
  rank?: number
  author?: string
  onClick: () => void
  ateState?: 'ate' | 'skipped' | null
  onAte?: (calories: number) => void
  onSkip?: () => void
  shareState?: 'shared' | 'sharing' | null
  onShare?: () => void
}

export default function ComboCard({
  title,
  description,
  tags,
  dishes,
  approximate_calories,
  upvotes,
  hasVoted,
  onUpvote,
  expires_at,
  rank,
  author,
  onClick,
  ateState,
  onAte,
  onSkip,
  shareState,
  onShare,
}: Props) {
  const expiry = expires_at ? formatExpiry(expires_at) : null
  const visibleTags = tags.slice(0, 2)
  const overflowCount = tags.length - 2

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-surface-card rounded-2xl shadow-card border border-surface-overlay p-4 transition-all duration-150 hover:shadow-card-lg hover:scale-[1.005] active:scale-[0.99]"
    >
      <div className="flex items-center gap-2 mb-1 min-w-0">
        {rank !== undefined && (
          <span className="flex-shrink-0 font-display text-lg font-bold text-brand-black w-7 text-center">
            {rank}
          </span>
        )}
        <h3 className="font-display font-semibold text-brand-black text-[14px] leading-snug line-clamp-1">
          {title}
        </h3>
      </div>

      {author && (
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-5 h-5 rounded-full bg-brand-gold/20 flex items-center justify-center flex-shrink-0">
            <span className="text-[9px] font-bold text-brand-gold leading-none">
              {author[0].toUpperCase()}
            </span>
          </div>
          <span className="text-[11px] text-muted">@{author}</span>
        </div>
      )}

      <p className="text-sm text-muted line-clamp-2 mb-3 leading-relaxed">{description}</p>

      {dishes && dishes.length > 0 && (
        <>
          <div className="border-t border-gray-100 mb-2.5" />
          <p className="text-[11px] text-muted mb-3 leading-relaxed">
            {'🍽 '}
            {dishes
              .slice(0, 3)
              .map((d) => d.name)
              .join(' · ')}
            {dishes.length > 3 && (
              <span className="opacity-60"> +{dishes.length - 3} more</span>
            )}
          </p>
        </>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tagStyle(tag)}`}
            >
              {tag}
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500">
              +{overflowCount}
            </span>
          )}
        </div>

        <div className="flex-shrink-0">
          {onUpvote !== undefined ? (
            <button
              onClick={(e) => { e.stopPropagation(); if (!hasVoted) onUpvote() }}
              disabled={hasVoted}
              aria-label={`Upvote (${upvotes ?? 0})`}
              className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition-colors ${
                hasVoted
                  ? 'text-brand-gold bg-brand-gold/10 cursor-default'
                  : 'text-muted hover:text-brand-gold hover:bg-brand-gold/10 active:scale-95'
              }`}
            >
              <ChevronUpIcon width={13} height={13} />
              {upvotes ?? 0}
            </button>
          ) : upvotes !== undefined ? (
            <span className="flex items-center gap-1 text-xs text-brand-gold font-medium">
              <ChevronUpIcon width={13} height={13} />
              {upvotes}
            </span>
          ) : approximate_calories !== undefined ? (
            <span className="text-[11px] text-muted">~{approximate_calories} cal</span>
          ) : null}
        </div>
      </div>

      {expiry && (
        <div className={`flex items-center gap-1.5 mt-2 text-[11px] ${EXPIRY_CLASS[expiry.level]}`}>
          {expiry.level === 'red' && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          )}
          <ClockIcon width={12} height={12} />
          {expiry.text}
        </div>
      )}

      {onAte !== undefined && (
        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-gray-100">
          <span className="text-[11px] text-muted flex-1">Did you eat this?</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (ateState !== 'ate') onAte(approximate_calories ?? 0)
            }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              ateState === 'ate'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-gray-100 text-muted hover:bg-emerald-50 hover:text-emerald-700'
            }`}
          >
            {ateState === 'ate' ? '✓ Ate it' : 'Ate it'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (ateState !== 'skipped') onSkip?.()
            }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              ateState === 'skipped'
                ? 'bg-gray-200 text-gray-600'
                : 'bg-gray-100 text-muted hover:bg-gray-200'
            }`}
          >
            {ateState === 'skipped' ? '✗ Skipped' : 'Skip'}
          </button>
        </div>
      )}

      {onShare !== undefined && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-100">
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (!shareState) onShare()
            }}
            disabled={!!shareState}
            className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-medium transition-colors ${
              shareState === 'shared'
                ? 'bg-brand-gold/15 text-brand-gold cursor-default'
                : shareState === 'sharing'
                ? 'bg-gray-100 text-muted cursor-default'
                : 'bg-gray-100 text-muted hover:bg-brand-gold/10 hover:text-brand-gold'
            }`}
          >
            {shareState === 'shared' ? '✓ Posted to community' : shareState === 'sharing' ? 'Posting…' : '↗ Post to community'}
          </button>
        </div>
      )}
    </button>
  )
}

export { tagStyle }
