'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { XMarkIcon } from './icons'
import { tagStyle } from './ComboCard'
import VoteButtons from './VoteButtons'
import { getCombo } from '@/services/communityService'
import { DINING_HALL_LABELS } from '@/types'
import type { Combo, CommunityCombo, VoteType } from '@/types'

function ShareButton({ title, hall }: { title: string; hall?: string }) {
  const [copied, setCopied] = useState(false)

  async function handleShare() {
    const text = hall
      ? `Check out this combo at ${hall}: ${title} – Buff Bites`
      : `Check out this combo: ${title} – Buff Bites`

    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title: 'Buff Bites', text }) } catch { /* cancelled */ }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleShare}
      className="flex-shrink-0 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
      aria-label="Share combo"
    >
      {copied ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      )}
    </button>
  )
}

function isCommunityCombo(c: Combo | CommunityCombo): c is CommunityCombo {
  return 'id' in c
}

interface Props {
  combo: Combo | CommunityCombo | null
  type: 'ai' | 'community'
  hasVoted?: boolean
  onVote?: (type: VoteType) => Promise<void>
  onClose: () => void
}

export default function ComboDetail({ combo, type, hasVoted = false, onVote, onClose }: Props) {
  const [visible, setVisible] = useState(false)
  const [detail, setDetail] = useState<CommunityCombo | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!combo) return
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [combo])

  useEffect(() => {
    if (type !== 'community' || !combo) return
    const c = combo as CommunityCombo
    setDetailLoading(true)
    getCombo(c.id)
      .then(setDetail)
      .catch(() => setDetail(c))
      .finally(() => setDetailLoading(false))
  }, [combo, type])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 280)
  }

  if (!combo) return null

  const community = type === 'community' ? (detail ?? (isCommunityCombo(combo) ? combo : null)) : null
  const displayDishes = community ? community.dishes : (combo as Combo).dishes
  const displayTags = community ? community.tags : combo.tags

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className={`absolute inset-0 bg-black transition-opacity duration-300 ${visible ? 'opacity-40' : 'opacity-0'}`}
        onMouseDown={handleClose}
      />

      <div
        ref={sheetRef}
        className={`relative bg-white rounded-t-2xl max-h-[88vh] flex flex-col transition-transform duration-300 ease-out ${visible ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="flex-shrink-0 flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="flex-shrink-0 flex items-start justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-lg font-bold text-brand-black pr-2 leading-tight flex-1">{combo.title}</h2>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <ShareButton
              title={combo.title}
              hall={community ? DINING_HALL_LABELS[community.dining_hall] : undefined}
            />
            <button
              onClick={handleClose}
              className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <XMarkIcon width={20} height={20} className="text-muted" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {community && (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="bg-gray-100 text-muted rounded-full px-3 py-1">
                {DINING_HALL_LABELS[community.dining_hall]}
              </span>
              <span className="bg-gray-100 text-muted rounded-full px-3 py-1">
                {community.date}
              </span>
              <span className="text-muted">@{community.author_username}</span>
            </div>
          )}

          <p className="text-sm text-muted leading-relaxed">{combo.description}</p>

          <div className="flex flex-wrap gap-1.5">
            {displayTags.map((tag) => (
              <span
                key={tag}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tagStyle(tag)}`}
              >
                {tag}
              </span>
            ))}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              Dishes
            </h3>
            {detailLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse h-10 bg-gray-100 rounded-lg" />
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {displayDishes.map((dish, i) => (
                  <li key={i} className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-brand-black">{dish.name}</p>
                      <p className="text-xs text-muted">{dish.station}</p>
                    </div>
                    {'servings' in dish && (dish as { servings: number }).servings > 1 && (
                      <span className="text-xs text-muted bg-gray-100 rounded-full px-2 py-0.5">
                        ×{(dish as { servings: number }).servings}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {type === 'ai' && 'approximate_calories' in combo && (
            <div className="bg-brand-gold/10 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-medium text-brand-black">Estimated calories</span>
              <span className="text-sm font-bold text-brand-gold">
                ~{(combo as Combo).approximate_calories} cal
              </span>
            </div>
          )}

          {community?.notes && (
            <blockquote className="border-l-2 border-gray-200 pl-3 text-sm italic text-muted">
              {community.notes}
            </blockquote>
          )}

          {community?.images && community.images.length > 0 && (
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
              {community.images.map((src, i) => (
                <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                  <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-gray-100">
                    <Image src={src} alt={`Photo ${i + 1}`} fill className="object-cover" />
                  </div>
                </a>
              ))}
            </div>
          )}

          {type === 'community' && <div className="h-20" />}
        </div>

        {type === 'community' && community && onVote && (
          <div className="flex-shrink-0 sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3">
            <VoteButtons
              comboId={community.id}
              upvotes={community.upvotes}
              downvotes={community.downvotes}
              hasVoted={hasVoted}
              onVote={onVote}
            />
          </div>
        )}
      </div>
    </div>
  )
}
