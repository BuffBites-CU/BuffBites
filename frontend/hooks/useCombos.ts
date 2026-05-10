import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { generateCombos } from '@/services/combosService'
import type { ComboResponse, DiningHall } from '@/types'

// Module-level cache survives navigation (component unmount/remount)
const comboCache = new Map<string, ComboResponse>()

export function useCombos(dining: DiningHall, date?: string) {
  const today = useMemo(() => new Date().toISOString().split('T')[0], [])
  const resolvedDate = date ?? today

  // Refs so the fetch effect can read current values without being re-triggered by them
  const diningRef = useRef(dining)
  const dateRef = useRef(resolvedDate)
  diningRef.current = dining
  dateRef.current = resolvedDate

  const [data, setData] = useState<ComboResponse | null>(() => comboCache.get(`${dining}::${resolvedDate}`) ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // When dining/date changes, serve from cache if available; otherwise clear stale data.
  // Does NOT trigger a new fetch — the user must hit the refresh button.
  useEffect(() => {
    const key = `${dining}::${resolvedDate}`
    const cached = comboCache.get(key)
    if (cached) {
      setData(cached)
      setError(null)
    } else {
      setData(null)
    }
  }, [dining, resolvedDate])

  // Fetch only when tick increments (initial mount or manual refresh)
  useEffect(() => {
    const currentDining = diningRef.current
    const currentDate = dateRef.current
    const key = `${currentDining}::${currentDate}`

    if (comboCache.has(key)) return

    let cancelled = false
    setLoading(true)
    setError(null)

    generateCombos(currentDining, currentDate)
      .then((result) => {
        if (cancelled) return
        comboCache.set(key, result)
        setData(result)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Something went wrong')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [tick])

  const refetch = useCallback(() => {
    const key = `${diningRef.current}::${dateRef.current}`
    comboCache.delete(key)
    setTick((n) => n + 1)
  }, [])

  return { data, loading, error, refetch }
}
