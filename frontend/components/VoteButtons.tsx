'use client'

import { useState } from 'react'
import { ChevronUpIcon, ChevronDownIcon } from './icons'
import { useAuth } from '@/context/AuthContext'
import type { VoteType } from '@/types'

interface Props {
  comboId: string
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
            ? 'bg-gray-100 text-muted cursor-not-allowed'
            : 'bg-brand-gold/10 text-brand-gold hover:bg-brand-gold/20 active:scale-95'
        }`}
      >
        {pending === 'upvote' ? (
          <Spinner />
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
            ? 'bg-gray-100 text-muted cursor-not-allowed'
            : 'bg-red-50 text-red-400 hover:bg-red-100 active:scale-95'
        }`}
      >
        {pending === 'downvote' ? (
          <Spinner />
        ) : (
          <ChevronDownIcon width={18} height={18} />
        )}
        <span>{downvotes}</span>
      </button>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
