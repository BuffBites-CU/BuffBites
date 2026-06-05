import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { generateCombos } from '@/services/combosService'
import { todayMST } from '@/lib/date'
import type { ComboResponse, DiningHall, NutritionGoals } from '@/types'

const comboCache = new Map<string, ComboResponse>()

function goalsKey(goals?: NutritionGoals): string {
  if (!goals) return ''
  const parts = [
    goals.protein_g_per_meal ? `p${goals.protein_g_per_meal}` : '',
    goals.dietary_focus ?? '',
    (goals.priority_nutrients ?? []).sort().join('+'),
  ]
  return parts.filter(Boolean).join('_')
}

export function useCombos(dining: DiningHall, date?: string, goals?: NutritionGoals) {
  const today = useMemo(() => todayMST(), [])
  const resolvedDate = date ?? today
  const gKey = useMemo(() => goalsKey(goals), [goals])

  const cacheKey = `${dining}::${resolvedDate}::${gKey}`

  const diningRef = useRef(dining)
  const dateRef   = useRef(resolvedDate)
  const goalsRef  = useRef(goals)
  const gKeyRef   = useRef(gKey)
  diningRef.current = dining
  dateRef.current   = resolvedDate
  goalsRef.current  = goals
  gKeyRef.current   = gKey

  const [data, setData]       = useState<ComboResponse | null>(() => comboCache.get(cacheKey) ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [tick, setTick]       = useState(0)

  useEffect(() => {
    const key = `${dining}::${resolvedDate}::${gKey}`
    const cached = comboCache.get(key)
    if (cached) { setData(cached); setError(null) }
    else         { setData(null) }
  }, [dining, resolvedDate, gKey])

  useEffect(() => {
    const key = `${diningRef.current}::${dateRef.current}::${gKeyRef.current}`
    if (comboCache.has(key)) return

    let cancelled = false
    setLoading(true)
    setError(null)

    generateCombos(diningRef.current, dateRef.current, goalsRef.current)
      .then((result) => {
        if (cancelled) return
        comboCache.set(key, result)
        setData(result)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Something went wrong')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [tick])

  const refetch = useCallback(() => {
    const key = `${diningRef.current}::${dateRef.current}::${gKeyRef.current}`
    comboCache.delete(key)
    setTick((n) => n + 1)
  }, [])

  return { data, loading, error, refetch }
}
