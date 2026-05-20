import { useCallback, useEffect, useRef, useState } from 'react'
import { getCombos, getTrends, vote as apiVote } from '@/services/communityService'
import type { CommunityCombo, DiningHall, VoteType } from '@/types'
import { useAuth } from '@/context/AuthContext'

export function useCommunity(mode: 'feed' | 'trends', dining_hall?: DiningHall) {
  const { firebaseUser } = useAuth()
  const [combos, setCombos] = useState<CommunityCombo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const votedIds = useRef<Set<string>>(new Set())
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const uid = firebaseUser?.uid
    const fetcher = mode === 'feed' ? getCombos(dining_hall, uid) : getTrends(dining_hall, uid)

    fetcher
      .then((result) => {
        if (cancelled) return
        setCombos(result)
        // Seed voted state from backend so it survives page refresh
        result.forEach((c) => { if (c.has_voted) votedIds.current.add(c.id) })
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [mode, dining_hall, tick, firebaseUser?.uid])

  const refetch = useCallback(() => setTick((n) => n + 1), [])

  const vote = useCallback(
    async (combo_id: string, type: VoteType) => {
      if (!firebaseUser || votedIds.current.has(combo_id)) return

      const snapshot = combos
      setCombos((prev) =>
        prev.map((c) =>
          c.id === combo_id
            ? {
                ...c,
                upvotes: type === 'upvote' ? c.upvotes + 1 : c.upvotes,
                downvotes: type === 'downvote' ? c.downvotes + 1 : c.downvotes,
                has_voted: true,
              }
            : c,
        ),
      )
      votedIds.current.add(combo_id)

      try {
        const token = await firebaseUser.getIdToken()
        await apiVote(combo_id, type, token)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : ''
        if (msg.includes('409') || msg.toLowerCase().includes('already voted')) {
          // Backend confirms already voted — keep optimistic state
          return
        }
        setCombos(snapshot)
        votedIds.current.delete(combo_id)
        setError(msg || 'Vote failed')
      }
    },
    [combos, firebaseUser],
  )

  return { combos, loading, error, refetch, vote, votedIds: votedIds.current }
}
