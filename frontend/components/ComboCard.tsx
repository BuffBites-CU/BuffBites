'use client'

import { ClockIcon, ChevronUpIcon } from './icons'
import type { ComboTag } from '@/types'
import { fuelScore, macroSplit } from '@/lib/nutrition'

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
  isFavorited?: boolean
  onFavorite?: () => void
  allergyWarning?: string   // e.g. "Contains: gluten, dairy"
  ateBeforeHint?: boolean   // show "you had this before" hint
  protein_g?: number
  carbs_g?: number
  fat_g?: number
  calorieTarget?: number    // user's per-meal calorie goal, for the Fuel Score
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
  isFavorited,
  onFavorite,
  allergyWarning,
  ateBeforeHint,
  protein_g,
  carbs_g,
  fat_g,
  calorieTarget,
}: Props) {
  const expiry = expires_at ? formatExpiry(expires_at) : null
  const visibleTags = tags.slice(0, 2)
  const overflowCount = tags.length - 2

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className="w-full text-left bg-surface-card rounded-2xl border-2 border-brand-black shadow-sticker p-4 transition-transform duration-100 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none cursor-pointer"
    >
      <div className="flex items-center gap-2 mb-1 min-w-0">
        {rank !== undefined && (
          <span className="flex-shrink-0 font-display text-lg font-bold text-brand-black w-7 text-center">
            {rank}
          </span>
        )}
        <h3 className="font-display font-semibold text-brand-black text-[14px] leading-snug line-clamp-1 flex-1">
          {title}
        </h3>
        {onFavorite !== undefined && (
          <button
            onClick={(e) => { e.stopPropagation(); onFavorite() }}
            aria-label={isFavorited ? 'Unfavorite' : 'Favorite'}
            className={`flex-shrink-0 p-1 rounded-full transition-all active:scale-90 ${
              isFavorited ? 'text-red-400' : 'text-brand-stone hover:text-red-300'
            }`}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill={isFavorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
          </button>
        )}
      </div>

      {/* Allergy warning */}
      {allergyWarning && (
        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-2">
          <span className="text-amber-500 text-xs">⚠</span>
          <span className="text-[11px] text-amber-700 font-medium">{allergyWarning}</span>
        </div>
      )}

      {/* Ate before hint */}
      {ateBeforeHint && (
        <div className="flex items-center gap-1 mb-2">
          <span className="text-[10px] text-brand/80 font-medium bg-brand/10 rounded-full px-2 py-0.5">
            ✓ You&apos;ve had this before
          </span>
        </div>
      )}

      {author && (
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-5 h-5 rounded-full bg-brand/20 flex items-center justify-center flex-shrink-0">
            <span className="text-[9px] font-bold text-brand-deep leading-none">
              {author[0].toUpperCase()}
            </span>
          </div>
          <span className="text-[11px] text-muted">@{author}</span>
        </div>
      )}

      <p className="text-sm text-muted line-clamp-2 mb-3 leading-relaxed">{description}</p>

      {approximate_calories !== undefined && protein_g !== undefined && (
        <MacroStrip
          calories={approximate_calories}
          protein_g={protein_g}
          carbs_g={carbs_g}
          fat_g={fat_g}
          calorieTarget={calorieTarget}
        />
      )}

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
                  ? 'text-brand-deep bg-brand/10 cursor-default'
                  : 'text-muted hover:text-brand-deep hover:bg-brand/10 active:scale-95'
              }`}
            >
              <ChevronUpIcon width={13} height={13} />
              {upvotes ?? 0}
            </button>
          ) : upvotes !== undefined ? (
            <span className="flex items-center gap-1 text-xs text-brand-deep font-medium">
              <ChevronUpIcon width={13} height={13} />
              {upvotes}
            </span>
          ) : approximate_calories !== undefined && protein_g === undefined ? (
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
              if (!ateState) onAte(approximate_calories ?? 0)
            }}
            disabled={!!ateState}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              ateState === 'ate'
                ? 'bg-emerald-100 text-emerald-700 cursor-default'
                : ateState === 'skipped'
                ? 'bg-gray-100 text-muted cursor-default opacity-60'
                : 'bg-gray-100 text-muted hover:bg-emerald-50 hover:text-emerald-700'
            }`}
          >
            {ateState === 'ate' ? '✓ Ate it' : 'Ate it'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (!ateState) onSkip?.()
            }}
            disabled={!!ateState}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              ateState === 'skipped'
                ? 'bg-gray-200 text-gray-600 cursor-default'
                : ateState === 'ate'
                ? 'bg-gray-100 text-muted cursor-default opacity-60'
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
                ? 'bg-brand/15 text-brand-deep cursor-default'
                : shareState === 'sharing'
                ? 'bg-gray-100 text-muted cursor-default'
                : 'bg-gray-100 text-muted hover:bg-brand/10 hover:text-brand-deep'
            }`}
          >
            {shareState === 'shared' ? '✓ Posted to community' : shareState === 'sharing' ? 'Posting…' : '↗ Post to community'}
          </button>
        </div>
      )}
    </div>
  )
}

function MacroStrip({
  calories, protein_g, carbs_g, fat_g, calorieTarget,
}: { calories: number; protein_g: number; carbs_g?: number; fat_g?: number; calorieTarget?: number }) {
  const fuel = fuelScore({ calories, protein_g, carbs_g, fat_g }, calorieTarget)
  const split = macroSplit({ calories, protein_g, carbs_g, fat_g })
  return (
    <div className="mb-3 rounded-xl bg-surface-overlay/70 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        {fuel && (
          <span className="flex items-center gap-1 text-[12px] font-display font-bold text-brand-black">
            <span aria-hidden>{fuel.emoji}</span>
            {fuel.label}
            <span className="text-muted font-sans font-medium">· {fuel.score}</span>
          </span>
        )}
        <span className="text-[11px] text-muted whitespace-nowrap">
          ~{calories} cal · <b className="text-brand-black">{protein_g}g</b> P
          {carbs_g !== undefined && <> · {carbs_g}g C</>}
          {fat_g !== undefined && <> · {fat_g}g F</>}
        </span>
      </div>
      {split && (
        <div
          className="mt-1.5 flex h-1.5 rounded-full overflow-hidden bg-surface-warm"
          role="img"
          aria-label={`Calories from protein ${Math.round(split.protein * 100)}%, carbs ${Math.round(split.carbs * 100)}%, fat ${Math.round(split.fat * 100)}%`}
        >
          <span className="bg-brand-black" style={{ width: `${split.protein * 100}%` }} />
          <span className="bg-brand" style={{ width: `${split.carbs * 100}%` }} />
          <span className="bg-brand-gold" style={{ width: `${split.fat * 100}%` }} />
        </div>
      )}
      {fuel && fuel.reasons.length > 0 && (
        <p className="mt-1 text-[10px] text-muted">{fuel.reasons.join(' · ')}</p>
      )}
    </div>
  )
}

export { tagStyle }
