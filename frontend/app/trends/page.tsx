'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getTrends, getWeeklyTrends } from '@/services/communityService'
import { useCommunity } from '@/hooks/useCommunity'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import FilterBar from '@/components/FilterBar'
import TrendingPost, { StudentAvatar } from '@/components/TrendingPost'
import ComboDetail from '@/components/ComboDetail'
import Spinner from '@/components/Spinner'
import { ChevronUpIcon } from '@/components/icons'
import { parseApiDate } from '@/lib/date'
import type { CommunityCombo, DiningHall, VoteType } from '@/types'

const MEDALS = ['', '🥇', '🥈', '🥉'] as const
type TrendsTab = 'today' | 'weekly'

function isRising(combo: CommunityCombo): boolean {
  const ageMs = Date.now() - parseApiDate(combo.created_at).getTime()
  return ageMs < 6 * 3_600_000 && combo.upvotes >= 3
}

/** One board from per-hall lists: each combo once, most upvoted first, top 20. */
function mergeTrends(lists: CommunityCombo[][]): CommunityCombo[] {
  const seen = new Set<string>()
  return lists
    .flat()
    .filter((c) => { if (seen.has(c.id)) return false; seen.add(c.id); return true })
    .sort((a, b) => b.upvotes - a.upvotes)
    .slice(0, 20)
}

interface PodiumCardProps {
  rank: 1 | 2 | 3
  combo: CommunityCombo
  onClick: () => void
}

function PodiumCard({ rank, combo, onClick }: PodiumCardProps) {
  const minH = rank === 1 ? 'min-h-[176px]' : rank === 2 ? 'min-h-[152px]' : 'min-h-[140px]'

  return (
    <button
      onClick={onClick}
      className={`card card-press w-full ${minH} p-3 flex flex-col items-center text-center animate-pop-in ring-2 ${
        rank === 1 ? 'ring-brand' : 'ring-transparent'
      }`}
      style={{ animationDelay: `${(3 - rank) * 80}ms` }}
    >
      <span className="plan-label !text-brand-black mb-1.5">No. 0{rank}</span>
      <StudentAvatar name={combo.author_username} size={rank === 1 ? 52 : 42} />
      <p className="mt-1.5 text-[11px] text-muted truncate max-w-full">@{combo.author_username}</p>
      <p className="font-display text-[16px] text-brand-black line-clamp-2 leading-tight flex-1">{combo.title}</p>
      <div className="mt-1 flex items-center gap-0.5 text-[12px] text-brand-deep font-semibold">
        <ChevronUpIcon width={12} height={12} />
        {combo.upvotes}
      </div>
    </button>
  )
}

export default function TrendsPage() {
  const { firebaseUser, signIn } = useAuth()

  const [selectedHalls, setSelectedHalls] = useState<DiningHall[]>([])
  const [activeCombo, setActiveCombo] = useState<CommunityCombo | null>(null)
  const [multiTrends, setMultiTrends] = useState<CommunityCombo[]>([])
  const [multiLoading, setMultiLoading] = useState(false)
  const [multiError, setMultiError] = useState('')
  const [activeTab, setActiveTab] = useState<TrendsTab>('today')
  const [weeklyTrends, setWeeklyTrends] = useState<CommunityCombo[]>([])
  const [weeklyLoading, setWeeklyLoading] = useState(false)
  const [weeklyError, setWeeklyError] = useState('')
  const [weeklyTick, setWeeklyTick] = useState(0)

  const singleHall = selectedHalls.length <= 1 ? selectedHalls[0] : undefined
  const useHook = selectedHalls.length <= 1
  const {
    combos: hookCombos, loading: hookLoading, error: hookError, refetch: hookRefetch, vote, votedIds,
  } = useCommunity('trends', singleHall)

  // Several halls: fetch each hall's board and merge them. The uid is a dependency
  // so has_voted is refetched for whoever is signed in.
  useEffect(() => {
    if (selectedHalls.length <= 1) return
    let cancelled = false
    setMultiLoading(true)
    setMultiError('')
    Promise.all(selectedHalls.map((h) => getTrends(h)))
      .then((results) => { if (!cancelled) setMultiTrends(mergeTrends(results)) })
      .catch((e: unknown) => { if (!cancelled) setMultiError(e instanceof Error ? e.message : 'Error') })
      .finally(() => { if (!cancelled) setMultiLoading(false) })
    return () => { cancelled = true }
  }, [selectedHalls, firebaseUser?.uid])

  const trends = useHook ? hookCombos : multiTrends
  const loading = useHook ? hookLoading : multiLoading
  const error = useHook ? hookError : multiError

  // This week's board, for the selected halls, fetched whenever the tab is shown.
  useEffect(() => {
    if (activeTab !== 'weekly') return
    let cancelled = false
    setWeeklyLoading(true)
    setWeeklyError('')
    const request = selectedHalls.length <= 1
      ? getWeeklyTrends(selectedHalls[0])
      : Promise.all(selectedHalls.map((h) => getWeeklyTrends(h))).then(mergeTrends)
    request
      .then((list) => { if (!cancelled) setWeeklyTrends(list) })
      .catch((e: unknown) => { if (!cancelled) setWeeklyError(e instanceof Error ? e.message : 'Error') })
      .finally(() => { if (!cancelled) setWeeklyLoading(false) })
    return () => { cancelled = true }
  }, [activeTab, selectedHalls, weeklyTick, firebaseUser?.uid])

  const refetch = activeTab === 'weekly'
    ? () => setWeeklyTick((n) => n + 1)
    : useHook
      ? hookRefetch
      : () => setSelectedHalls([...selectedHalls])

  useScrollRestoration('trends')
  usePullToRefresh(refetch)

  async function handleVote(type: VoteType) {
    if (!firebaseUser) {
      signIn().catch(() => {})
      return
    }
    if (!activeCombo || votedIds.has(activeCombo.id)) return
    const id = activeCombo.id
    // useCommunity counts the vote in its own list. The multi-hall and weekly boards
    // are fetched here, so count it in them too, and take it back if the vote fails.
    const bump = (by: number) => (list: CommunityCombo[]) => list.map((c) => (
      c.id === id
        ? { ...c, upvotes: c.upvotes + (type === 'upvote' ? by : 0), downvotes: c.downvotes + (type === 'downvote' ? by : 0) }
        : c
    ))
    setMultiTrends(bump(1))
    setWeeklyTrends(bump(1))
    await vote(id, type)
    if (!votedIds.has(id)) {
      setMultiTrends(bump(-1))
      setWeeklyTrends(bump(-1))
    }
  }

  const displayTrends = activeTab === 'weekly' ? weeklyTrends : trends
  const displayLoading = activeTab === 'weekly' ? weeklyLoading : loading
  const displayError = activeTab === 'weekly' ? weeklyError : error
  const liveCombo = activeCombo ? displayTrends.find((c) => c.id === activeCombo.id) : undefined
  const podiumTrends = displayTrends.slice(0, 3)
  const listTrends = displayTrends.slice(3, 20)
  const hasPodium = podiumTrends.length === 3

  return (
    <div className="min-h-screen pb-28">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-surface/85 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 pt-4 pb-3 flex items-center justify-between">
          <div><span className="plan-label">Sheet B-01</span><h1 className="text-[32px] text-brand-black leading-none">Trending</h1></div>
          {activeTab === 'today' && (
            <span className="flex items-center gap-1 text-xs font-display font-medium px-2.5 py-1 rounded-full bg-surface-overlay text-muted">
              Posts stay up 24h
            </span>
          )}
        </div>

        {/* Today / This Week tabs */}
        <div className="max-w-md mx-auto px-4 pb-2 flex gap-2">
          {(['today', 'weekly'] as TrendsTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-full text-xs font-display font-semibold tracking-wide transition-all ${
                activeTab === tab
                  ? 'bg-brand text-white'
                  : 'bg-surface-overlay text-muted hover:bg-surface-warm'
              }`}
            >
              {tab === 'today' ? 'Today' : 'This Week'}
            </button>
          ))}
        </div>

        <div className="max-w-md mx-auto">
          <FilterBar
            mode="multi"
            selectedMulti={selectedHalls}
            onChangeMulti={setSelectedHalls}
          />
        </div>
        {multiLoading && selectedHalls.length > 1 && (
          <div className="max-w-md mx-auto px-4 pb-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted bg-surface-overlay rounded-full px-3 py-1">
              <Spinner size={12} className="flex-shrink-0" />
              Fetching from {selectedHalls.length} halls…
            </span>
          </div>
        )}
      </header>

      <div className="max-w-md mx-auto px-4 pt-4 animate-page-in">
        {displayLoading && <TrendSkeletons />}

        {!displayLoading && displayError && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-sm text-muted">{displayError}</p>
          </div>
        )}

        {!displayLoading && !displayError && displayTrends.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="text-5xl">🔥</span>
            <p className="font-semibold text-brand-black">Nothing trending yet</p>
            <p className="text-sm text-muted">Share a combo to get on the board!</p>
          </div>
        )}

        {!displayLoading && displayTrends.length > 0 && (
          <>
            {hasPodium && (
              <>
                <div className="grid grid-cols-3 items-end gap-2 mb-4">
                  <PodiumCard rank={2} combo={podiumTrends[1]} onClick={() => setActiveCombo(podiumTrends[1])} />
                  <PodiumCard rank={1} combo={podiumTrends[0]} onClick={() => setActiveCombo(podiumTrends[0])} />
                  <PodiumCard rank={3} combo={podiumTrends[2]} onClick={() => setActiveCombo(podiumTrends[2])} />
                </div>
                {listTrends.length > 0 && <div className="border-t border-surface-warm mb-4" />}
              </>
            )}

            <div className="space-y-4">
              {(hasPodium ? listTrends : displayTrends).map((combo, i) => {
                const rank = hasPodium ? i + 4 : i + 1
                const medal = !hasPodium && rank <= 3 ? MEDALS[rank] : undefined
                return (
                  <div key={combo.id} className="relative">
                    {medal && (
                      <div className={`absolute -top-2 -left-1 z-10 text-2xl ${rank === 1 ? 'scale-125' : ''}`}>
                        {medal}
                      </div>
                    )}
                    {isRising(combo) && (
                      <div className="absolute -top-1.5 right-2 z-10">
                        <span className="flex items-center gap-1 bg-brand-black text-white text-[9px] font-display font-bold uppercase rounded-full px-2 py-0.5 shadow-sm">⚡ Rising</span>
                      </div>
                    )}
                    <TrendingPost combo={combo} rank={medal ? undefined : rank} onClick={() => setActiveCombo(combo)} />
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
          liveCounts={liveCombo}
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
      <div className="border-t border-brand-black/25 mb-2" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-surface-card rounded-2xl border border-brand-black/25 p-4 space-y-3 overflow-hidden">
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
