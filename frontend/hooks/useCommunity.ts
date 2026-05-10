import { useCallback, useEffect, useRef, useState } from 'react'
import { getCombos, getTrends, vote as apiVote } from '@/services/communityService'
import type { CommunityCombo, DiningHall, VoteType } from '@/types'
import { useAuth } from '@/context/AuthContext'

export function useCommunity(mode: 'feed' | 'trends', dining_hall?: DiningHall) {
  const { firebaseUid } = useAuth()
  const [combos, setCombos] = useState<CommunityCombo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const votedIds = useRef<Set<string>>(new Set())
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const fetcher = mode === 'feed' ? getCombos(dining_hall) : getTrends(dining_hall)

    fetcher
      .then((result) => { if (!cancelled) setCombos(result) })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [mode, dining_hall, tick])

  const refetch = useCallback(() => setTick((n) => n + 1), [])

  const vote = useCallback(
    async (combo_id: string, type: VoteType) => {
      if (!firebaseUid || votedIds.current.has(combo_id)) return

      const snapshot = combos
      setCombos((prev) =>
        prev.map((c) =>
          c.id === combo_id
            ? {
                ...c,
                upvotes: type === 'upvote' ? c.upvotes + 1 : c.upvotes,
                downvotes: type === 'downvote' ? c.downvotes + 1 : c.downvotes,
              }
            : c,
        ),
      )
      votedIds.current.add(combo_id)

      try {
        await apiVote(combo_id, type, firebaseUid)
      } catch (e: unknown) {
        setCombos(snapshot)
        votedIds.current.delete(combo_id)
        setError(e instanceof Error ? e.message : 'Vote failed')
      }
    },
    [combos, firebaseUid],
  )

  return { combos, loading, error, refetch, vote, votedIds: votedIds.current }
}
