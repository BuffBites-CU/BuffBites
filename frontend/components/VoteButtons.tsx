'use client'

import { useState } from 'react'
import { ChevronUpIcon, ChevronDownIcon } from './icons'
import Spinner from './Spinner'
import { useAuth } from '@/context/AuthContext'
import type { VoteType } from '@/types'

interface Props {
  upvotes: number
  downvotes: number
  hasVoted: boolean
  onVote: (type: VoteType) => Promise<void>
}

export default function VoteButtons({ upvotes, downvotes, hasVoted, onVote }: Props) {
  const { firebaseUid } = useAuth()
  const [pending, setPending] = useState<VoteType | null>(null)

  if (!firebaseUid) {
    return (
      <p className="text-center text-sm text-muted py-3">
        Sign in to vote on combos
      </p>
    )
  }

  async function handleVote(type: VoteType) {
    if (hasVoted || pending) return
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10)
    setPending(type)
    try {
      await onVote(type)
    } finally {
      setPending(null)
    }
  }

  const disabled = hasVoted || pending !== null

  return (
    <div className="flex gap-3">
      <button
        onClick={() => handleVote('upvote')}
        disabled={disabled}
        aria-label={`Upvote (${upvotes})`}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm transition-all ${
          disabled
            ? 'bg-surface-overlay text-muted cursor-not-allowed'
            : 'bg-brand/10 text-brand-deep hover:bg-brand/20 active:scale-95'
        }`}
      >
        {pending === 'upvote' ? (
          <Spinner size={16} className="text-current" />
        ) : (
          <ChevronUpIcon width={18} height={18} />
        )}
        <span>{upvotes}</span>
      </button>

      <button
        onClick={() => handleVote('downvote')}
        disabled={disabled}
        aria-label={`Downvote (${downvotes})`}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm transition-all ${
          disabled
            ? 'bg-surface-overlay text-muted cursor-not-allowed'
            : 'bg-surface-overlay text-muted hover:bg-surface-overlay active:scale-95'
        }`}
      >
        {pending === 'downvote' ? (
          <Spinner size={16} className="text-current" />
        ) : (
          <ChevronDownIcon width={18} height={18} />
        )}
        <span>{downvotes}</span>
      </button>
    </div>
  )
}
