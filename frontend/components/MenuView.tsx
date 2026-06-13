'use client'

import { useEffect, useState } from 'react'
import { useMenu } from '@/hooks/useMenu'
import { ChevronDownIcon } from './icons'
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
  const [selectedStation, setSelectedStation] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const stations = Object.entries(data?.categories ?? {}).filter(([station]) =>
    matchesPeriod(station, period),
  )

  // Default to the first station whenever the list changes
  // (new dining hall, date, or meal period).
  useEffect(() => {
    setSelectedStation(stations.length > 0 ? stations[0][0] : null)
    setDropdownOpen(false)
  }, [dining, date, period, stations.length, stations[0]?.[0]])

  if (loading) return <MenuSkeletons />

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-muted">{error}</p>
      </div>
    )
  }

  if (stations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="text-4xl">🍽</span>
        <p className="text-sm font-medium text-brand-black">No {period.toLowerCase()} menu here today.</p>
        <p className="text-sm text-muted">Try another meal period or dining hall.</p>
      </div>
    )
  }

  const active = stations.find(([station]) => station === selectedStation) ?? stations[0]
  const [activeStation, activeItems] = active

  return (
    <div className="space-y-2.5">
      <div className="relative">
        <button
          type="button"
          onClick={() => setDropdownOpen((v) => !v)}
          aria-expanded={dropdownOpen}
          className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-surface-card rounded-2xl border border-surface-overlay text-left hover:bg-surface-overlay/60 transition-colors"
        >
          <h3 className="font-display text-sm font-bold text-brand-black tracking-tight truncate">{activeStation}</h3>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[11px] font-medium text-muted">{activeItems.length} items</span>
            <ChevronDownIcon
              width={14}
              height={14}
              className={`text-muted transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
            />
          </div>
        </button>

        {dropdownOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
            <div className="absolute left-0 right-0 mt-1.5 z-20 bg-surface-card rounded-2xl border border-surface-overlay shadow-card-lg max-h-72 overflow-y-auto">
              {stations.map(([station, items]) => (
                <button
                  key={station}
                  type="button"
                  onClick={() => { setSelectedStation(station); setDropdownOpen(false) }}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                    station === activeStation
                      ? 'bg-brand-gold/15 text-brand-black'
                      : 'text-brand-black hover:bg-surface-overlay/60'
                  }`}
                >
                  <span className="font-display text-sm font-semibold tracking-tight truncate">{station}</span>
                  <span className="text-[11px] font-medium text-muted flex-shrink-0">{items.length} items</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="bg-surface-card rounded-2xl border border-surface-overlay overflow-hidden">
        <ul className="divide-y divide-surface-overlay/60">
          {activeItems.map((item, i) => (
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
