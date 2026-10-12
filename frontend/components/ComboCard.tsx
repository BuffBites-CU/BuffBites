'use client'

import { ClockIcon, ChevronUpIcon } from './icons'
import type { ComboTag } from '@/types'
import { fuelScore, macroSplit } from '@/lib/nutrition'
import { parseApiDate } from '@/lib/date'
import Doodle, { doodleFor } from './Doodle'

const TAG_STYLES: Record<string, string> = {
  vegan: 'bg-surface-overlay text-brand-black',
  vegetarian: 'bg-surface-overlay text-brand-black',
  'gluten-free': 'bg-surface-overlay text-brand-black',
  halal: 'bg-surface-overlay text-brand-black',
  'high-protein': 'bg-surface-overlay text-brand-black',
  light: 'bg-surface-overlay text-brand-black',
  hearty: 'bg-surface-overlay text-brand-black',
  balanced: 'bg-surface-overlay text-brand-black',
  'low-carb': 'bg-surface-overlay text-brand-black',
  'high-fiber': 'bg-surface-overlay text-brand-black',
  'low-calorie': 'bg-surface-overlay text-brand-black',
  'comfort-food': 'bg-surface-overlay text-brand-black',
  'omega-3': 'bg-surface-overlay text-brand-black',
  'high-carb': 'bg-surface-overlay text-brand-black',
}

function tagStyle(tag: string) {
  return TAG_STYLES[tag] ?? 'bg-surface-overlay text-brand-black'
}

function formatExpiry(iso: string): { text: string; level: 'normal' | 'amber' | 'red' } {
  const ms = parseApiDate(iso).getTime() - Date.now()
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
  amber: 'text-brand-black',
  red: 'text-brand-black',
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
      className="card card-press w-full text-left p-4 cursor-pointer"
    >
      <div className="flex items-center gap-3 mb-1 min-w-0">
        <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-surface-overlay/70 flex items-center justify-center text-brand-black">
          <Doodle name={doodleFor(title, ...(dishes ?? []).map((d) => d.name), ...tags)} size={38} />
        </div>
        {rank !== undefined && (
          <span className="flex-shrink-0 font-display text-lg font-bold text-brand-black w-7 text-center">
            {rank}
          </span>
        )}
        <h3 className="font-display text-brand-black text-[20px] leading-tight line-clamp-2 flex-1">
          {title}
        </h3>
        {onFavorite !== undefined && (
          <button
            onClick={(e) => { e.stopPropagation(); onFavorite() }}
            aria-label={isFavorited ? 'Unfavorite' : 'Favorite'}
            className={`flex-shrink-0 p-1 rounded-full transition-all active:scale-90 ${
              isFavorited ? 'text-muted' : 'text-brand-stone hover:text-muted'
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
        <div className="flex items-center gap-1.5 bg-surface-overlay border border-brand-black/25 rounded-lg px-2.5 py-1.5 mb-2">
          <span className="text-brand-black text-xs">⚠</span>
          <span className="text-[11px] text-brand-black font-medium">{allergyWarning}</span>
        </div>
      )}

      {/* Ate before hint */}
      {ateBeforeHint && (
        <div className="flex items-center gap-1 mb-2">
          <span className="text-[10px] text-brand-deep font-medium bg-brand/10 rounded-full px-2 py-0.5">
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
          <div className="border-t border-brand-black/25 mb-2.5" />
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
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-surface-overlay text-brand-black">
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
            <span className="w-1.5 h-1.5 rounded-full bg-brand-black animate-pulse" />
          )}
          <ClockIcon width={12} height={12} />
          {expiry.text}
        </div>
      )}

      {onAte !== undefined && (
        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-brand-black/25">
          <span className="text-[11px] text-muted flex-1">Did you eat this?</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (!ateState) onAte(approximate_calories ?? 0)
            }}
            disabled={!!ateState}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              ateState === 'ate'
                ? 'bg-surface-overlay text-brand-black cursor-default'
                : ateState === 'skipped'
                ? 'bg-surface-overlay text-muted cursor-default opacity-60'
                : 'bg-surface-overlay text-muted hover:bg-surface-overlay hover:text-brand-black'
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
                ? 'bg-surface-warm text-brand-black cursor-default'
                : ateState === 'ate'
                ? 'bg-surface-overlay text-muted cursor-default opacity-60'
                : 'bg-surface-overlay text-muted hover:bg-surface-warm'
            }`}
          >
            {ateState === 'skipped' ? '✗ Skipped' : 'Skip'}
          </button>
        </div>
      )}

      {onShare !== undefined && (
        <div className="mt-2.5 pt-2.5 border-t border-brand-black/25">
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
                ? 'bg-surface-overlay text-muted cursor-default'
                : 'bg-surface-overlay text-muted hover:bg-brand/10 hover:text-brand-deep'
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
          <span className="hatch bg-surface-card" style={{ width: `${split.carbs * 100}%` }} />
          <span className="bg-surface-warm" style={{ width: `${split.fat * 100}%` }} />
        </div>
      )}
      {fuel && fuel.reasons.length > 0 && (
        <p className="mt-1 text-[10px] text-muted">{fuel.reasons.join(' · ')}</p>
      )}
    </div>
  )
}

export { tagStyle }
