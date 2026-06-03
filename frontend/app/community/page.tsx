'use client'

import { useMemo, useState } from 'react'
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
import type { CommunityCombo, DiningHall, FavoriteCombo, VoteType } from '@/types'

type FeedTab = 'all' | 'saved'

function isRising(combo: CommunityCombo): boolean {
  const ageMs = Date.now() - new Date(combo.created_at).getTime()
  return ageMs < 6 * 3_600_000 && combo.upvotes >= 3
}

export default function CommunityPage() {
  const router = useRouter()
  const { firebaseUser, loading: authLoading } = useAuth()
  const { showToast } = useToast()

  const [selectedDining, setSelectedDining] = useState<DiningHall | undefined>()
  const [publishOpen, setPublishOpen] = useState(false)
  const [activeCombo, setActiveCombo] = useState<CommunityCombo | null>(null)
  const [feedTab, setFeedTab] = useState<FeedTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)

  const { combos, loading, error, refetch, vote, votedIds } = useCommunity('feed', selectedDining)

  // Load favorites from localStorage for the Saved tab (also works from profile)
  const [favorites] = useState<FavoriteCombo[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('bb_favorites') ?? '[]') } catch { return [] }
  })
  const favTitles = useMemo(() => new Set(favorites.map((f) => f.title)), [favorites])

  useScrollRestoration('community')
  usePullToRefresh(refetch)

  if (!authLoading && !firebaseUser) {
    router.replace('/')
    return null
  }

  async function handleVote(type: VoteType) {
    if (activeCombo) await vote(activeCombo.id, type)
  }

  const filtered = useMemo(() => {
    let list = combos
    if (feedTab === 'saved') list = list.filter((c) => favTitles.has(c.title))
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((c) =>
        c.title.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)) ||
        c.dishes.some((d) => d.name.toLowerCase().includes(q))
      )
    }
    return list
  }, [combos, feedTab, searchQuery, favTitles])

  return (
    <div className="min-h-screen bg-surface pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur-md border-b border-surface-warm">
        <div className="max-w-md mx-auto flex items-center justify-between px-4 h-14">
          <h1 className="font-display text-xl font-bold text-brand-black">Community</h1>
        </div>

        {/* Search bar */}
        <div className="max-w-md mx-auto px-4 pb-2">
          <div className={`flex items-center gap-2 bg-surface-overlay rounded-xl px-3 py-2 transition-all ${searchFocused ? 'ring-2 ring-brand-gold' : ''}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted flex-shrink-0">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search combos, dishes, tags…"
              className="flex-1 bg-transparent text-sm text-brand-black placeholder:text-muted focus:outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-muted hover:text-brand-black text-xs">✕</button>
            )}
          </div>
        </div>

        {/* Tabs: All / Saved */}
        <div className="max-w-md mx-auto px-4 pb-2 flex gap-2">
          {(['all', 'saved'] as FeedTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFeedTab(tab)}
              className={`px-4 py-1.5 rounded-full text-xs font-display font-semibold tracking-wide transition-all capitalize ${
                feedTab === tab
                  ? 'bg-brand-black text-brand-gold'
                  : 'bg-surface-overlay text-muted hover:bg-surface-warm'
              }`}
            >
              {tab === 'saved' ? '♥ Saved' : 'All'}
            </button>
          ))}
        </div>

        <div className="max-w-md mx-auto">
          <FilterBar mode="single" selected={selectedDining} onChange={setSelectedDining} />
        </div>
      </header>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 pt-4 animate-page-in">
        {loading && <FeedSkeletons />}

        {!loading && error && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-sm text-muted">{error}</p>
            <button onClick={refetch} className="px-5 py-2.5 rounded-xl bg-brand-gold text-brand-black text-sm font-display font-medium">Try again</button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            {feedTab === 'saved' ? (
              <>
                <span className="text-4xl">♥</span>
                <p className="font-display font-semibold text-brand-black">No saved combos</p>
                <p className="text-sm text-muted">Heart an AI combo on the Discover tab to save it here.</p>
              </>
            ) : searchQuery ? (
              <>
                <span className="text-4xl">🔍</span>
                <p className="font-display font-semibold text-brand-black">No results</p>
                <p className="text-sm text-muted">Try a different search term or tag.</p>
              </>
            ) : (
              <>
                <svg width="72" height="72" viewBox="0 0 72 72" fill="none" className="opacity-60">
                  <circle cx="36" cy="36" r="30" stroke="#CFB87C" strokeWidth="2" strokeDasharray="4 3" />
                  <path d="M24 36c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="#CFB87C" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="36" cy="42" r="5" fill="#CFB87C" fillOpacity="0.3" stroke="#CFB87C" strokeWidth="1.5" />
                </svg>
                <p className="font-display font-semibold text-brand-black">No combos yet today</p>
                <p className="text-sm text-muted">Be the first to share what you made!</p>
              </>
            )}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((combo) => (
              <div key={combo.id} className="relative">
                {isRising(combo) && (
                  <div className="absolute -top-1.5 left-3 z-10">
                    <span className="flex items-center gap-1 bg-amber-400 text-amber-900 text-[9px] font-display font-bold tracking-wider uppercase rounded-full px-2 py-0.5 shadow-sm">
                      ⚡ Rising
                    </span>
                  </div>
                )}
                <ComboCard
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
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      {firebaseUser && (
        <button
          onClick={() => setPublishOpen(true)}
          className="fixed bottom-24 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl bg-brand-gold text-brand-black text-sm font-display font-semibold shadow-gold hover:opacity-90 active:scale-95 transition-all"
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
        <div key={i} className="bg-surface-card rounded-2xl border border-surface-overlay p-4 space-y-3 overflow-hidden">
          <div className="flex justify-between items-center">
            <div className="h-4 shimmer rounded-full w-1/2" />
            <div className="h-4 shimmer rounded-full w-10" />
          </div>
          <div className="space-y-2">
            <div className="h-3 shimmer rounded-full" />
            <div className="h-3 shimmer rounded-full w-3/4" />
          </div>
          <div className="flex gap-1.5">
            <div className="h-5 shimmer rounded-full w-14" />
            <div className="h-5 shimmer rounded-full w-18" />
          </div>
        </div>
      ))}
    </div>
  )
}
