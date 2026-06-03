'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useCommunity } from '@/hooks/useCommunity'
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
          {firebaseUser && (
            <button
              onClick={() => setPublishOpen(true)}
              className="px-4 py-2 rounded-xl bg-brand-gold text-brand-black text-sm font-semibold hover:opacity-90 active:scale-95 transition-all"
            >
              Share Combo
            </button>
          )}
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
      <div className="max-w-md mx-auto px-4 pt-4">
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
            <span className="text-5xl">🍜</span>
            <p className="font-semibold text-brand-black">No combos yet today</p>
            <p className="text-sm text-muted">Be the first to share what you made!</p>
            {firebaseUser && (
              <button
                onClick={() => setPublishOpen(true)}
                className="mt-2 px-5 py-2.5 rounded-xl bg-brand-gold text-brand-black text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Share a Combo
              </button>
            )}
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
                upvotes={combo.upvotes}
                author_username={combo.author_username}
                dining_hall={combo.dining_hall}
                expires_at={combo.expires_at}
                onClick={() => setActiveCombo(combo)}
              />
            ))}
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
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 animate-pulse">
          <div className="flex justify-between">
            <div className="h-4 bg-gray-200 rounded-full w-1/2" />
            <div className="h-4 bg-gray-200 rounded-full w-10" />
          </div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded-full" />
            <div className="h-3 bg-gray-200 rounded-full w-3/4" />
          </div>
          <div className="flex justify-between">
            <div className="flex gap-1.5">
              <div className="h-5 bg-gray-200 rounded-full w-14" />
              <div className="h-5 bg-gray-200 rounded-full w-18" />
            </div>
            <div className="h-4 bg-gray-200 rounded-full w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}
