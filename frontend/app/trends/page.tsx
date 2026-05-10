'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getTrends } from '@/services/communityService'
import { useCommunity } from '@/hooks/useCommunity'
import FilterBar from '@/components/FilterBar'
import ComboCard from '@/components/ComboCard'
import ComboDetail from '@/components/ComboDetail'
import type { CommunityCombo, DiningHall, VoteType } from '@/types'

const MEDALS = ['', '🥇', '🥈', '🥉'] as const

function timeUntilMidnightUTC(): string {
  const now = Date.now()
  const midnight = new Date()
  midnight.setUTCHours(24, 0, 0, 0)
  const ms = midnight.getTime() - now
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return `${h}h ${m}m`
}

export default function TrendsPage() {
  const router = useRouter()
  const { firebaseUser, loading: authLoading } = useAuth()

  const [selectedHalls, setSelectedHalls] = useState<DiningHall[]>([])
  const [activeCombo, setActiveCombo] = useState<CommunityCombo | null>(null)
  const [multiTrends, setMultiTrends] = useState<CommunityCombo[]>([])
  const [multiLoading, setMultiLoading] = useState(false)
  const [multiError, setMultiError] = useState('')

  // Single-hall path: reuse the hook when 0 or 1 halls selected
  const singleHall = selectedHalls.length <= 1 ? selectedHalls[0] : undefined
  const useHook = selectedHalls.length <= 1
  const { combos: hookCombos, loading: hookLoading, error: hookError, vote, votedIds } = useCommunity(
    'trends',
    singleHall,
  )

  // Multi-hall path: parallel fetches merged client-side
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

  const resetIn = useMemo(timeUntilMidnightUTC, [])

  if (!authLoading && !firebaseUser) {
    router.replace('/')
    return null
  }

  async function handleVote(type: VoteType) {
    if (activeCombo) await vote(activeCombo.id, type)
  }

  return (
    <div className="min-h-screen bg-surface pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-md mx-auto px-4 pt-4 pb-1">
          <h1 className="text-xl font-bold text-brand-black">Trending Today</h1>
          <p className="text-xs text-muted mt-0.5">Resets in {resetIn}</p>
        </div>
        <div className="max-w-md mx-auto">
          <FilterBar
            mode="multi"
            selectedMulti={selectedHalls}
            onChangeMulti={setSelectedHalls}
          />
        </div>
      </header>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 pt-4">
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
          <div className="space-y-3">
            {trends.slice(0, 20).map((combo, i) => {
              const rank = i + 1
              const medal = rank <= 3 ? MEDALS[rank] : undefined

              return (
                <div key={combo.id} className="relative">
                  {medal && (
                    <div className={`absolute -top-2 -left-1 z-10 text-2xl ${rank === 1 ? 'scale-125' : ''}`}>
                      {medal}
                    </div>
                  )}
                  <div className={rank === 1 ? 'ring-2 ring-brand-gold rounded-xl' : ''}>
                    <ComboCard
                      title={combo.title}
                      description={combo.description ?? ''}
                      tags={combo.tags}
                      upvotes={combo.upvotes}
                      author_username={combo.author_username}
                      dining_hall={combo.dining_hall}
                      rank={medal ? undefined : rank}
                      onClick={() => setActiveCombo(combo)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
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
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 animate-pulse">
          <div className="flex gap-3 items-center">
            <div className="h-5 bg-gray-200 rounded w-6" />
            <div className="h-4 bg-gray-200 rounded-full flex-1" />
            <div className="h-4 bg-gray-200 rounded-full w-10" />
          </div>
          <div className="h-3 bg-gray-200 rounded-full w-3/4" />
          <div className="flex gap-1.5">
            <div className="h-5 bg-gray-200 rounded-full w-14" />
            <div className="h-5 bg-gray-200 rounded-full w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}
