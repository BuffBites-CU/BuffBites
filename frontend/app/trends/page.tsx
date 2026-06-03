'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getTrends } from '@/services/communityService'
import { useCommunity } from '@/hooks/useCommunity'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import FilterBar from '@/components/FilterBar'
import ComboCard from '@/components/ComboCard'
import ComboDetail from '@/components/ComboDetail'
import { ChevronUpIcon } from '@/components/icons'
import { DINING_HALL_LABELS } from '@/types'
import type { CommunityCombo, DiningHall, VoteType } from '@/types'

const MEDALS = ['', '🥇', '🥈', '🥉'] as const

function timeUntilMidnightUTC(): { text: string; urgent: boolean } {
  const now = Date.now()
  const midnight = new Date()
  midnight.setUTCHours(24, 0, 0, 0)
  const ms = midnight.getTime() - now
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return { text: `${h}h ${m}m`, urgent: h < 2 }
}

interface PodiumCardProps {
  rank: 1 | 2 | 3
  combo: CommunityCombo
  onClick: () => void
}

function PodiumCard({ rank, combo, onClick }: PodiumCardProps) {
  const medal = MEDALS[rank]
  const minH = rank === 1 ? 'min-h-[148px]' : rank === 2 ? 'min-h-[120px]' : 'min-h-[104px]'
  const ring = rank === 1 ? 'ring-2 ring-brand-gold' : 'ring-1 ring-gray-100'

  return (
    <button
      onClick={onClick}
      className={`w-full ${minH} bg-surface-card rounded-2xl shadow-sm p-3 flex flex-col items-center text-center transition-all hover:shadow-md active:scale-[0.98] ${ring}`}
    >
      <span className={`text-2xl leading-none mb-1 ${rank === 1 ? 'scale-125' : ''}`}>{medal}</span>
      <p className="text-xs font-semibold text-brand-black line-clamp-3 leading-tight flex-1">{combo.title}</p>
      <div className="mt-1.5 flex items-center gap-0.5 text-[11px] text-brand-gold font-semibold">
        <ChevronUpIcon width={11} height={11} />
        {combo.upvotes}
      </div>
      <span className="mt-1 text-[9px] bg-gray-100 text-muted rounded-full px-1.5 py-0.5 leading-none line-clamp-1 max-w-full">
        {DINING_HALL_LABELS[combo.dining_hall] ?? combo.dining_hall}
      </span>
    </button>
  )
}

export default function TrendsPage() {
  const router = useRouter()
  const { firebaseUser, loading: authLoading } = useAuth()

  const [selectedHalls, setSelectedHalls] = useState<DiningHall[]>([])
  const [activeCombo, setActiveCombo] = useState<CommunityCombo | null>(null)
  const [multiTrends, setMultiTrends] = useState<CommunityCombo[]>([])
  const [multiLoading, setMultiLoading] = useState(false)
  const [multiError, setMultiError] = useState('')

  const singleHall = selectedHalls.length <= 1 ? selectedHalls[0] : undefined
  const useHook = selectedHalls.length <= 1
  const { combos: hookCombos, loading: hookLoading, error: hookError, vote, votedIds } = useCommunity(
    'trends',
    singleHall,
  )

  useEffect(() => {
    if (selectedHalls.length <= 1) return
    let cancelled = false
    setMultiLoading(true)
    setMultiError('')
    Promise.all(selectedHalls.map((h) => getTrends(h)))
      .then((results) => {
        if (cancelled) return
        const seen = new Set<string>()
        const merged = results
          .flat()
          .filter((c) => { if (seen.has(c.id)) return false; seen.add(c.id); return true })
          .sort((a, b) => b.upvotes - a.upvotes)
          .slice(0, 20)
        setMultiTrends(merged)
      })
      .catch((e: unknown) => { if (!cancelled) setMultiError(e instanceof Error ? e.message : 'Error') })
      .finally(() => { if (!cancelled) setMultiLoading(false) })
    return () => { cancelled = true }
  }, [selectedHalls])

  const trends = useHook ? hookCombos : multiTrends
  const loading = useHook ? hookLoading : multiLoading
  const error = useHook ? hookError : multiError

  const resetInfo = useMemo(timeUntilMidnightUTC, [])

  const refetch = useHook
    ? () => { /* hook refetches via useCommunity */ }
    : () => setSelectedHalls([...selectedHalls])

  useScrollRestoration('trends')
  usePullToRefresh(refetch)

  if (!authLoading && !firebaseUser) {
    router.replace('/')
    return null
  }

  async function handleVote(type: VoteType) {
    if (activeCombo) await vote(activeCombo.id, type)
  }

  const podiumTrends = trends.slice(0, 3)
  const listTrends = trends.slice(3, 20)
  const hasPodium = podiumTrends.length === 3

  return (
    <div className="min-h-screen bg-surface pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-md mx-auto px-4 pt-4 pb-1 flex items-center justify-between">
          <h1 className="text-xl font-bold text-brand-black">Trending Today</h1>
          <span className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
            resetInfo.urgent
              ? 'bg-amber-100 text-amber-700'
              : 'bg-gray-100 text-muted'
          }`}>
            🔄 Resets in {resetInfo.text}
          </span>
        </div>
        <div className="max-w-md mx-auto">
          <FilterBar
            mode="multi"
            selectedMulti={selectedHalls}
            onChangeMulti={setSelectedHalls}
          />
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 pt-4 animate-page-in">
        {loading && <TrendSkeletons />}

        {!loading && error && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-sm text-muted">{error}</p>
          </div>
        )}

        {!loading && !error && trends.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="text-5xl">🔥</span>
            <p className="font-semibold text-brand-black">Nothing trending yet</p>
            <p className="text-sm text-muted">Share a combo to get on the board!</p>
          </div>
        )}

        {!loading && !error && trends.length > 0 && (
          <>
            {hasPodium && (
              <>
                {/* Podium — #2 left, #1 center, #3 right */}
                <div className="grid grid-cols-3 items-end gap-2 mb-4">
                  <PodiumCard rank={2} combo={podiumTrends[1]} onClick={() => setActiveCombo(podiumTrends[1])} />
                  <PodiumCard rank={1} combo={podiumTrends[0]} onClick={() => setActiveCombo(podiumTrends[0])} />
                  <PodiumCard rank={3} combo={podiumTrends[2]} onClick={() => setActiveCombo(podiumTrends[2])} />
                </div>
                {listTrends.length > 0 && (
                  <div className="border-t border-gray-200 mb-4" />
                )}
              </>
            )}

            {/* Ranks #4+ (or all when < 3 results) */}
            <div className="space-y-3">
              {(hasPodium ? listTrends : trends).map((combo, i) => {
                const rank = hasPodium ? i + 4 : i + 1
                const medal = !hasPodium && rank <= 3 ? MEDALS[rank] : undefined

                return (
                  <div key={combo.id} className="relative">
                    {medal && (
                      <div className={`absolute -top-2 -left-1 z-10 text-2xl ${rank === 1 ? 'scale-125' : ''}`}>
                        {medal}
                      </div>
                    )}
                    <div className={!hasPodium && rank === 1 ? 'ring-2 ring-brand-gold rounded-xl' : ''}>
                      <ComboCard
                        title={combo.title}
                        description={combo.description ?? ''}
                        tags={combo.tags}
                        dishes={combo.dishes}
                        upvotes={combo.upvotes}
                        rank={medal ? undefined : rank}
                        onClick={() => setActiveCombo(combo)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {activeCombo && (
        <ComboDetail
          combo={activeCombo}
          type="community"
          hasVoted={votedIds.has(activeCombo.id)}
          onVote={handleVote}
          onClose={() => setActiveCombo(null)}
        />
      )}
    </div>
  )
}

function TrendSkeletons() {
  return (
    <div className="space-y-3">
      {/* Podium skeleton */}
      <div className="grid grid-cols-3 items-end gap-2 mb-2">
        <div className="min-h-[120px] shimmer rounded-2xl" />
        <div className="min-h-[148px] shimmer rounded-2xl" />
        <div className="min-h-[104px] shimmer rounded-2xl" />
      </div>
      <div className="border-t border-gray-100 mb-2" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-surface-card rounded-2xl border border-gray-100 p-4 space-y-3 overflow-hidden">
          <div className="flex gap-3 items-center">
            <div className="h-5 shimmer rounded w-6" />
            <div className="h-4 shimmer rounded-full flex-1" />
            <div className="h-4 shimmer rounded-full w-10" />
          </div>
          <div className="h-3 shimmer rounded-full w-3/4" />
          <div className="flex gap-1.5">
            <div className="h-5 shimmer rounded-full w-14" />
            <div className="h-5 shimmer rounded-full w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}
