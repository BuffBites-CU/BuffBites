import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { generateCombos } from '@/services/combosService'
import { todayMST } from '@/lib/date'
import type { ComboResponse, DietaryPreference, DiningHall, NutritionGoals } from '@/types'

const comboCache = new Map<string, ComboResponse>()

function goalsKey(goals?: NutritionGoals, prefs?: DietaryPreference[]): string {
  const parts = [
    goals?.protein_g_per_meal ? `p${goals.protein_g_per_meal}` : '',
    goals?.dietary_focus ?? '',
    (goals?.priority_nutrients ?? []).slice().sort().join('+'),
    (prefs ?? []).slice().sort().join('+'),
  ]
  return parts.filter(Boolean).join('_')
}

export function useCombos(
  dining: DiningHall,
  date?: string,
  goals?: NutritionGoals,
  dietaryPrefs?: DietaryPreference[],
) {
  const today = useMemo(() => todayMST(), [])
  const resolvedDate = date ?? today
  const gKey = useMemo(() => goalsKey(goals, dietaryPrefs), [goals, dietaryPrefs])

  const cacheKey = `${dining}::${resolvedDate}::${gKey}`

  // Hold the latest request inputs so the fetch effect can stay keyed purely on
  // cacheKey (which already encodes their content) without re-running on every
  // render — goals/dietaryPrefs are fresh object refs each render.
  const argsRef = useRef({ dining, resolvedDate, goals, dietaryPrefs })
  argsRef.current = { dining, resolvedDate, goals, dietaryPrefs }

  const [data, setData]       = useState<ComboResponse | null>(() => comboCache.get(cacheKey) ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [tick, setTick]       = useState(0)

  useEffect(() => {
    const cached = comboCache.get(cacheKey)
    if (cached) {
      setData(cached)
      setError(null)
      setLoading(false)
      return
    }

    // New hall/date/prefs with nothing cached: drop the previous selection's
    // combos immediately so they never linger on screen during the fetch.
    setData(null)
    setError(null)
    setLoading(true)

    let cancelled = false
    const args = argsRef.current
    generateCombos(args.dining, args.resolvedDate, args.goals, args.dietaryPrefs)
      .then((result) => {
        if (cancelled) return
        comboCache.set(cacheKey, result)
        setData(result)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Something went wrong')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    // Changing cacheKey (hall/date/prefs) or refetch cancels the in-flight
    // request, so a late response can never overwrite combos for a different
    // selection — this is what kept one hall's combos showing under another.
    return () => { cancelled = true }
  }, [cacheKey, tick])

  const refetch = useCallback(() => {
    comboCache.delete(cacheKey)
    setTick((n) => n + 1)
  }, [cacheKey])

  return { data, loading, error, refetch }
}
