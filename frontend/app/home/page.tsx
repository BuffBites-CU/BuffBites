'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useCombos } from '@/hooks/useCombos'
import DiningSelector from '@/components/DiningSelector'
import MealPeriodTabs from '@/components/MealPeriodTabs'
import ComboCard from '@/components/ComboCard'
import ComboDetail from '@/components/ComboDetail'
import { ArrowPathIcon } from '@/components/icons'
import type { Combo, DiningHall, MealPeriod } from '@/types'

function buildDateOptions() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const iso = d.toISOString().split('T')[0]
    const label = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })
    const day = d.getDate()
    return { iso, label, day }
  })
}

export default function HomePage() {
  const router = useRouter()
  const { firebaseUser, loading: authLoading } = useAuth()

  const [selectedDining, setSelectedDining] = useState<DiningHall>('c4c')
  const [selectedPeriod, setSelectedPeriod] = useState<MealPeriod>('Lunch')
  const [activeCombo, setActiveCombo] = useState<Combo | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)

  const dateOptions = useMemo(buildDateOptions, [])
  const [selectedDate, setSelectedDate] = useState(dateOptions[0].iso)
  const selectedDateObj = dateOptions.find((d) => d.iso === selectedDate) ?? dateOptions[0]

  const { data, loading, error, refetch } = useCombos(selectedDining, selectedDate)

  const combosForPeriod = data?.combos[selectedPeriod] ?? []
  const counts = useMemo(
    () => ({
      Breakfast: data?.combos.Breakfast.length ?? 0,
      Lunch: data?.combos.Lunch.length ?? 0,
      Dinner: data?.combos.Dinner.length ?? 0,
    }),
    [data],
  )

  if (!authLoading && !firebaseUser) {
    router.replace('/')
    return null
  }

  return (
    <div className="min-h-screen bg-surface pb-24">
      <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-md mx-auto flex items-center justify-between px-4 h-14">
          <h1 className="text-xl font-bold text-brand-black tracking-tight">BuffBites</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDatePicker((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-muted bg-gray-100 rounded-full px-3 py-1 hover:bg-gray-200 transition-colors"
            >
              {selectedDateObj.label === 'Today' ? 'Today' : `${selectedDateObj.label} ${selectedDateObj.day}`}
              <svg className={`w-3 h-3 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <button
              onClick={refetch}
              disabled={loading}
              aria-label="Refresh combos"
              className="p-1.5 rounded-full text-muted hover:text-brand-black hover:bg-gray-100 transition-colors disabled:opacity-40"
            >
              <ArrowPathIcon width={18} height={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {showDatePicker && (
          <div className="max-w-md mx-auto px-4 pb-2 overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 w-max">
              {dateOptions.map((opt) => (
                <button
                  key={opt.iso}
                  onClick={() => { setSelectedDate(opt.iso); setShowDatePicker(false) }}
                  className={`flex flex-col items-center px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex-shrink-0 ${
                    opt.iso === selectedDate
                      ? 'bg-brand-gold text-brand-black'
                      : 'bg-gray-100 text-muted hover:bg-gray-200'
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wide">{opt.label}</span>
                  <span className="text-base font-bold leading-none mt-0.5">{opt.day}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="max-w-md mx-auto">
          <DiningSelector selected={selectedDining} onChange={setSelectedDining} />
        </div>

        <div className="max-w-md mx-auto">
          <MealPeriodTabs
            selected={selectedPeriod}
            onChange={setSelectedPeriod}
            counts={counts}
          />
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 pt-4 animate-page-in">
        {loading && <ComboSkeletons />}

        {!loading && error && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-sm text-muted">{error}</p>
            <button
              onClick={refetch}
              className="px-5 py-2.5 rounded-xl bg-brand-gold text-brand-black text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && !data && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-sm text-muted">Tap refresh to generate combos for this dining hall.</p>
            <button
              onClick={refetch}
              className="px-5 py-2.5 rounded-xl bg-brand-gold text-brand-black text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Generate combos
            </button>
          </div>
        )}

        {!loading && !error && combosForPeriod.length === 0 && data && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="text-4xl">🍽</span>
            <p className="text-sm text-muted">
              {selectedPeriod} isn&apos;t served at this dining hall today.
            </p>
          </div>
        )}

        {!loading && !error && combosForPeriod.length > 0 && (
          <div className="space-y-3">
            {combosForPeriod.map((combo, i) => (
              <ComboCard
                key={i}
                title={combo.title}
                description={combo.description}
                tags={combo.tags}
                dishes={combo.dishes}
                approximate_calories={combo.approximate_calories}
                onClick={() => setActiveCombo(combo)}
              />
            ))}
          </div>
        )}
      </div>

      {activeCombo && (
        <ComboDetail
          combo={activeCombo}
          type="ai"
          onClose={() => setActiveCombo(null)}
        />
      )}
    </div>
  )
}

function ComboSkeletons() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-surface-card rounded-2xl border border-gray-100 p-4 space-y-3 overflow-hidden">
          <div className="flex justify-between items-center">
            <div className="h-4 shimmer rounded-full w-2/3" />
            <div className="h-4 shimmer rounded-full w-14" />
          </div>
          <div className="space-y-2">
            <div className="h-3 shimmer rounded-full" />
            <div className="h-3 shimmer rounded-full w-4/5" />
          </div>
          <div className="border-t border-gray-50 pt-2.5">
            <div className="h-3 shimmer rounded-full w-3/4" />
          </div>
          <div className="flex gap-2">
            <div className="h-5 shimmer rounded-full w-16" />
            <div className="h-5 shimmer rounded-full w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}
