'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useMenu } from '@/hooks/useMenu'
import type { DiningHall, MealPeriod, MenuItem } from '@/types'

interface Props {
  dining: DiningHall
  date: string
  period: MealPeriod
}

export default function MenuView({ dining, date, period }: Props) {
  const { data, loading, error } = useMenu(dining, date)
  const [selected, setSelected] = useState<MenuItem | null>(null)

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
    <>
      <div className="space-y-4">
        {stations.map(([station, items]) => (
          <div key={station} className="bg-surface-card rounded-2xl border border-surface-overlay overflow-hidden">
            <div className="px-4 py-2.5 bg-surface-overlay/60 border-b border-surface-overlay">
              <h3 className="font-display text-sm font-bold text-brand-black tracking-tight">{station}</h3>
            </div>
            <ul className="divide-y divide-surface-overlay/60">
              {items.map((item, i) => (
                <li
                  key={i}
                  onClick={() => setSelected(item)}
                  className="flex items-start justify-between gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-overlay/30 active:bg-surface-overlay/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand-black leading-snug">{item.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.is_vegan && <Badge className="bg-emerald-100 text-emerald-800">Vegan</Badge>}
                      {!item.is_vegan && item.is_vegetarian && <Badge className="bg-green-100 text-green-800">Veg</Badge>}
                      {item.allergens?.slice(0, 2).map((a) => (
                        <Badge key={a} className="bg-amber-100 text-amber-800">{a}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {item.calories != null && (
                      <span className="text-xs font-display font-semibold text-muted whitespace-nowrap mt-0.5">
                        {item.calories} cal
                      </span>
                    )}
                    <span className="text-[10px] text-brand-gold">Details →</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-center text-[10px] text-muted mt-1 mb-2 opacity-50">
          Tap any item for nutrition details · {data?.day_of_week}
        </p>
      </div>

      {selected && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-center"
          onClick={() => setSelected(null)}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-md bg-white rounded-t-3xl p-6 pb-10 max-h-[80vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-5" />

            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-display font-bold text-brand-black leading-snug">
                  {selected.name}
                </h2>
                {selected.serving_size && (
                  <p className="text-xs text-muted mt-0.5">Serving: {selected.serving_size}</p>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-muted hover:bg-gray-200"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-4">
              {selected.is_vegan && <Badge className="bg-emerald-100 text-emerald-800">Vegan</Badge>}
              {!selected.is_vegan && selected.is_vegetarian && <Badge className="bg-green-100 text-green-800">Vegetarian</Badge>}
              {selected.dietary_labels?.map((label) => (
                <Badge key={label} className="bg-blue-100 text-blue-800">{label}</Badge>
              ))}
            </div>

            {selected.calories != null && (
              <div className="bg-brand-gold/10 rounded-2xl p-4 mb-4 text-center">
                <p className="text-3xl font-display font-bold text-brand-gold">{selected.calories}</p>
                <p className="text-xs text-muted mt-0.5">calories per serving</p>
              </div>
            )}

            {selected.nutrition && Object.keys(selected.nutrition).length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-bold text-brand-black uppercase tracking-wide mb-2">Nutrition Facts</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["Protein",       selected.nutrition.protein_g,       "g"],
                    ["Carbohydrates", selected.nutrition.carbohydrates_g, "g"],
                    ["Fat",           selected.nutrition.fat_g,           "g"],
                    ["Fiber",         selected.nutrition.fiber_g,         "g"],
                    ["Sodium",        selected.nutrition.sodium_mg,       "mg"],
                    ["Sugar",         selected.nutrition.total_sugar_g,   "g"],
                    ["Saturated Fat", selected.nutrition.saturated_fat_g, "g"],
                    ["Cholesterol",   selected.nutrition.cholesterol_mg,  "mg"],
                    ["Calcium",       selected.nutrition.calcium_mg,      "mg"],
                    ["Iron",          selected.nutrition.iron_mg,         "mg"],
                    ["Potassium",     selected.nutrition.potassium_mg,    "mg"],
                  ].filter(([, val]) => val != null).map(([label, val, unit]) => (
                    <div key={String(label)} className="bg-gray-50 rounded-2xl px-3 py-2.5">
                      <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
                      <p className="text-sm font-display font-semibold text-brand-black">{val}{unit}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selected.allergens && selected.allergens.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1.5">⚠ Contains Allergens</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.allergens.map((a) => (
                    <Badge key={a} className="bg-amber-100 text-amber-800">{a}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${className}`}>
      {children}
    </span>
  )
}

function matchesPeriod(station: string, period: MealPeriod): boolean {
  const s = station.toLowerCase()
  const isBreakfast = /breakfast|morning|brunch/.test(s)
  if (period === 'Breakfast') return isBreakfast
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