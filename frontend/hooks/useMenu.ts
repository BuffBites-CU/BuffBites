import { useEffect, useState } from 'react'
import { getMenu } from '@/services/combosService'
import { todayMST } from '@/lib/date'
import type { DiningHall, MenuResponse } from '@/types'

const menuCache = new Map<string, MenuResponse>()

/**
 * Fetches the raw (non-AI) menu for a dining hall + date and caches it by key,
 * mirroring useCombos so switching between the Combos and Menu views is instant.
 */
export function useMenu(dining: DiningHall, date?: string, enabled = true) {
  const resolvedDate = date ?? todayMST()
  const cacheKey = `${dining}::${resolvedDate}`

  const [data, setData] = useState<MenuResponse | null>(() => menuCache.get(cacheKey) ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return

    const cached = menuCache.get(cacheKey)
    if (cached) { setData(cached); setError(null); return }

    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)

    getMenu(dining, resolvedDate)
      .then((result) => {
        if (cancelled) return
        menuCache.set(cacheKey, result)
        setData(result)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : 'Something went wrong'
        // A missing day reads as "no menu" rather than an error state.
        setError(msg.includes('404') ? null : msg)
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [cacheKey, dining, resolvedDate, enabled])

  return { data, loading, error }
}
