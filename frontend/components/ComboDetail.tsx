'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { XMarkIcon } from './icons'
import { tagStyle } from './ComboCard'
import VoteButtons from './VoteButtons'
import { getCombo } from '@/services/communityService'
import { getNutrition, type NutritionInfo } from '@/services/combosService'
import { getComments, addComment, deleteComment } from '@/services/commentsService'
import { useAuth } from '@/context/AuthContext'
import { DINING_HALL_LABELS } from '@/types'
import type { Combo, Comment, CommunityCombo, VoteType } from '@/types'

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
  diningHall?: string
  date?: string
  hasVoted?: boolean
  onVote?: (type: VoteType) => Promise<void>
  onClose: () => void
}

export default function ComboDetail({ combo, type, diningHall, date, hasVoted = false, onVote, onClose }: Props) {
  const { firebaseUser, username } = useAuth()
  const [visible, setVisible] = useState(false)
  const [detail, setDetail] = useState<CommunityCombo | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [nutrition, setNutrition] = useState<Record<string, NutritionInfo>>({})
  const sheetRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

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

    // Load comments
    setCommentsLoading(true)
    getComments(c.id)
      .then(setComments)
      .catch(() => {})
      .finally(() => setCommentsLoading(false))
  }, [combo, type])

  // Fetch nutrition for AI combos
  useEffect(() => {
    if (type !== 'ai' || !combo || !diningHall || !date) return
    const dishes = (combo as Combo).dishes.map((d) => d.name)
    if (dishes.length === 0) return
    getNutrition(diningHall, date, dishes)
      .then(setNutrition)
      .catch(() => {})
  }, [combo, type, diningHall, date])

  async function handleAddComment() {
    if (!firebaseUser || !commentText.trim() || !community) return
    setSubmitting(true)
    try {
      const token = await firebaseUser.getIdToken()
      const newComment = await addComment(community.id, commentText.trim(), token)
      setComments((prev) => [...prev, newComment])
      setCommentText('')
    } catch { /* silent */ }
    finally { setSubmitting(false) }
  }

  async function handleDeleteComment(commentId: string) {
    if (!firebaseUser) return
    const token = await firebaseUser.getIdToken()
    await deleteComment(commentId, token)
    setComments((prev) => prev.filter((c) => c.id !== commentId))
  }

  // Push a hash so the browser back button closes the sheet
  useEffect(() => {
    if (!combo) return
    window.history.pushState(null, '', '#detail')

    function onPopState() {
      setVisible(false)
      setTimeout(() => onCloseRef.current(), 280)
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      if (window.location.hash === '#detail') {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }
  }, [combo])

  function handleClose() {
    if (window.location.hash === '#detail') {
      window.history.back()
    } else {
      setVisible(false)
      setTimeout(onClose, 280)
    }
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
        className={`relative bg-white rounded-t-3xl max-h-[88vh] flex flex-col transition-transform duration-300 ease-out ${visible ? 'translate-y-0' : 'translate-y-full'}`}
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
                {displayDishes.map((dish, i) => {
                  const n = nutrition[dish.name]
                  return (
                    <li key={i} className="py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-display font-semibold text-brand-black">{dish.name}</p>
                        <p className="text-xs text-muted">{dish.station}</p>
                        {n && (n.protein_g || n.fat_g || n.carbs_g) && (
                          <div className="flex gap-3 mt-1">
                            {n.protein_g != null && <span className="text-[10px] text-muted"><span className="font-medium text-brand-black">{Math.round(n.protein_g)}g</span> protein</span>}
                            {n.fat_g != null && <span className="text-[10px] text-muted"><span className="font-medium text-brand-black">{Math.round(n.fat_g)}g</span> fat</span>}
                            {n.carbs_g != null && <span className="text-[10px] text-muted"><span className="font-medium text-brand-black">{Math.round(n.carbs_g)}g</span> carbs</span>}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {n?.calories != null && (
                          <span className="text-xs font-semibold text-brand-gold bg-brand-gold/10 rounded-full px-2 py-0.5">
                            {Math.round(n.calories)} cal
                          </span>
                        )}
                        {'servings' in dish && (dish as { servings: number }).servings > 1 && (
                          <span className="text-xs text-muted bg-surface-overlay rounded-full px-2 py-0.5">
                            ×{(dish as { servings: number }).servings}
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
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

          {/* ── Comments ── */}
          {type === 'community' && (
            <div>
              <h3 className="text-xs font-display font-semibold text-muted uppercase tracking-wider mb-3">
                Comments {comments.length > 0 ? `(${comments.length})` : ''}
              </h3>

              {commentsLoading && (
                <div className="space-y-2">
                  {[1, 2].map((i) => <div key={i} className="h-12 shimmer rounded-xl" />)}
                </div>
              )}

              {!commentsLoading && comments.length === 0 && (
                <p className="text-sm text-muted">No comments yet. Be the first!</p>
              )}

              {!commentsLoading && comments.length > 0 && (
                <div className="space-y-3">
                  {comments.map((c) => (
                    <div key={c.id} className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-brand-gold/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-bold text-brand-gold">{c.author_username[0].toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0 bg-surface-overlay rounded-2xl px-3 py-2">
                        <p className="text-[11px] font-display font-semibold text-brand-black mb-0.5">@{c.author_username}</p>
                        <p className="text-sm text-brand-black leading-snug">{c.text}</p>
                      </div>
                      {firebaseUser?.uid === c.author_firebase_uid && (
                        <button
                          onClick={() => handleDeleteComment(c.id)}
                          className="p-1 text-muted hover:text-red-400 transition-colors flex-shrink-0"
                          aria-label="Delete comment"
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add comment input */}
              {firebaseUser && (
                <div className="flex items-center gap-2 mt-4">
                  <div className="w-7 h-7 rounded-full bg-brand-gold/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-brand-gold">{(username ?? 'U')[0].toUpperCase()}</span>
                  </div>
                  <div className="flex-1 flex items-center gap-2 bg-surface-overlay rounded-2xl px-3 py-2">
                    <input
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment() } }}
                      placeholder="Add a comment…"
                      maxLength={500}
                      className="flex-1 bg-transparent text-sm text-brand-black placeholder:text-muted focus:outline-none"
                    />
                    <button
                      onClick={handleAddComment}
                      disabled={!commentText.trim() || submitting}
                      className="text-brand-gold disabled:opacity-40 transition-opacity"
                      aria-label="Post comment"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M2 12L22 2 12 22 10 14 2 12z" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
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
