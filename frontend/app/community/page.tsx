'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useCommunity } from '@/hooks/useCommunity'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import ComboCard from '@/components/ComboCard'
import ComboDetail from '@/components/ComboDetail'
import FilterBar from '@/components/FilterBar'
import PublishComboModal from '@/components/PublishComboModal'
import type { CommunityCombo, DiningHall, VoteType } from '@/types'

export default function CommunityPage() {
  const router = useRouter()
  const { firebaseUser, loading: authLoading } = useAuth()
  const { showToast } = useToast()

  const [selectedDining, setSelectedDining] = useState<DiningHall | undefined>()
  const [publishOpen, setPublishOpen] = useState(false)
  const [activeCombo, setActiveCombo] = useState<CommunityCombo | null>(null)

  const { combos, loading, error, refetch, vote, votedIds } = useCommunity('feed', selectedDining)

  useScrollRestoration('community')
  usePullToRefresh(refetch)

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
        <div className="max-w-md mx-auto flex items-center justify-between px-4 h-14">
          <h1 className="text-xl font-bold text-brand-black">Community</h1>
        </div>

        <div className="max-w-md mx-auto">
          <FilterBar
            mode="single"
            selected={selectedDining}
            onChange={setSelectedDining}
          />
        </div>
      </header>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 pt-4 animate-page-in">
        {loading && <FeedSkeletons />}

        {!loading && error && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-sm text-muted">{error}</p>
            <button onClick={refetch} className="px-5 py-2.5 rounded-xl bg-brand-gold text-brand-black text-sm font-medium">
              Try again
            </button>
          </div>
        )}

        {!loading && !error && combos.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" className="opacity-60">
              <circle cx="36" cy="36" r="30" stroke="#CFB87C" strokeWidth="2" strokeDasharray="4 3" />
              <path d="M24 36c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="#CFB87C" strokeWidth="2" strokeLinecap="round" />
              <circle cx="36" cy="42" r="5" fill="#CFB87C" fillOpacity="0.3" stroke="#CFB87C" strokeWidth="1.5" />
              <path d="M32 30l2-4M40 30l-2-4" stroke="#CFB87C" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p className="font-semibold text-brand-black">No combos yet today</p>
            <p className="text-sm text-muted">Be the first to share what you made!</p>
          </div>
        )}

        {!loading && !error && combos.length > 0 && (
          <div className="space-y-3">
            {combos.map((combo) => (
              <ComboCard
                key={combo.id}
                title={combo.title}
                description={combo.description ?? ''}
                tags={combo.tags}
                dishes={combo.dishes}
                upvotes={combo.upvotes}
                hasVoted={combo.has_voted}
                onUpvote={() => vote(combo.id, 'upvote')}
                expires_at={combo.expires_at}
                author={combo.author_username}
                onClick={() => setActiveCombo(combo)}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB — Share Combo */}
      {firebaseUser && (
        <button
          onClick={() => setPublishOpen(true)}
          className="fixed bottom-24 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl bg-brand-gold text-brand-black text-sm font-semibold shadow-lg hover:opacity-90 active:scale-95 transition-all"
          aria-label="Share a combo"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12l7-7 7 7" />
          </svg>
          Share Combo
        </button>
      )}

      {activeCombo && (
        <ComboDetail
          combo={activeCombo}
          type="community"
          hasVoted={votedIds.has(activeCombo.id)}
          onVote={handleVote}
          onClose={() => setActiveCombo(null)}
        />
      )}

      {publishOpen && (
        <PublishComboModal
          onClose={() => setPublishOpen(false)}
          onSuccess={() => {
            setPublishOpen(false)
            refetch()
            showToast('Combo published!', 'success')
          }}
        />
      )}
    </div>
  )
}

function FeedSkeletons() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-surface-card rounded-2xl border border-gray-100 p-4 space-y-3 overflow-hidden">
          <div className="flex justify-between items-center">
            <div className="h-4 shimmer rounded-full w-1/2" />
            <div className="h-4 shimmer rounded-full w-10" />
          </div>
          <div className="space-y-2">
            <div className="h-3 shimmer rounded-full" />
            <div className="h-3 shimmer rounded-full w-3/4" />
          </div>
          <div className="border-t border-gray-50 pt-2.5">
            <div className="h-3 shimmer rounded-full w-2/3" />
          </div>
          <div className="flex justify-between items-center">
            <div className="flex gap-1.5">
              <div className="h-5 shimmer rounded-full w-14" />
              <div className="h-5 shimmer rounded-full w-18" />
            </div>
            <div className="h-4 shimmer rounded-full w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}
