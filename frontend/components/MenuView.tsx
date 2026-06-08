'use client'

import { useMenu } from '@/hooks/useMenu'
import type { DiningHall, MealPeriod } from '@/types'

interface Props {
  dining: DiningHall
  date: string
  period: MealPeriod
}

/**
 * Plain, no-AI listing of the day's menu grouped by station — the "just show me
 * the menu" view for people who want to browse like Nutrislice. Stations are
 * loosely filtered to the active meal period by keyword.
 */
export default function MenuView({ dining, date, period }: Props) {
  const { data, loading, error } = useMenu(dining, date)

  if (loading) return <MenuSkeletons />

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-muted">{error}</p>
      </div>
    )
  }

  const stations = Object.entries(data?.categories ?? {}).filter(([station]) =>
    matchesPeriod(station, period),
  )

  if (stations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="text-4xl">🍽</span>
        <p className="text-sm font-medium text-brand-black">No {period.toLowerCase()} menu here today.</p>
        <p className="text-sm text-muted">Try another meal period or dining hall.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {stations.map(([station, items]) => (
        <div key={station} className="bg-surface-card rounded-2xl border border-surface-overlay overflow-hidden">
          <div className="px-4 py-2.5 bg-surface-overlay/60 border-b border-surface-overlay">
            <h3 className="font-display text-sm font-bold text-brand-black tracking-tight">{station}</h3>
          </div>
          <ul className="divide-y divide-surface-overlay/60">
            {items.map((item, i) => (
              <li key={i} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-brand-black leading-snug">{item.name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {item.is_vegan && <Badge className="bg-emerald-100 text-emerald-800">Vegan</Badge>}
                    {!item.is_vegan && item.is_vegetarian && <Badge className="bg-green-100 text-green-800">Veg</Badge>}
                  </div>
                </div>
                {item.calories != null && (
                  <span className="flex-shrink-0 text-xs font-display font-semibold text-muted whitespace-nowrap mt-0.5">
                    {item.calories} cal
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-center text-[10px] text-muted mt-1 mb-2 opacity-50">
        Live menu · {data?.day_of_week}
      </p>
    </div>
  )
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${className}`}>
      {children}
    </span>
  )
}

/** Keyword match a station name to a meal period, mirroring the backend classifier. */
function matchesPeriod(station: string, period: MealPeriod): boolean {
  const s = station.toLowerCase()
  const isBreakfast = /breakfast|morning|brunch/.test(s)
  if (period === 'Breakfast') return isBreakfast
  // Lunch and Dinner share most stations; only exclude clearly breakfast-only ones.
  return !isBreakfast
}

function MenuSkeletons() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-surface-card rounded-2xl border border-surface-overlay overflow-hidden">
          <div className="px-4 py-3 bg-surface-overlay/60">
            <div className="h-3.5 shimmer rounded-full w-1/3" />
          </div>
          <div className="p-4 space-y-3">
            <div className="h-3 shimmer rounded-full w-3/4" />
            <div className="h-3 shimmer rounded-full w-2/3" />
            <div className="h-3 shimmer rounded-full w-4/5" />
          </div>
        </div>
      ))}
    </div>
  )
}
