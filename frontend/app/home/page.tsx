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

const dateLabel = () => {
  const d = new Date()
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function HomePage() {
  const router = useRouter()
  const { firebaseUser, loading: authLoading } = useAuth()

  const [selectedDining, setSelectedDining] = useState<DiningHall>('c4c')
  const [selectedPeriod, setSelectedPeriod] = useState<MealPeriod>('Lunch')
  const [activeCombo, setActiveCombo] = useState<Combo | null>(null)

  const { data, loading, error, refetch } = useCombos(selectedDining)

  const dateStr = useMemo(dateLabel, [])

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
            <span className="text-xs font-medium text-muted bg-gray-100 rounded-full px-3 py-1">
              {dateStr}
            </span>
            <button
              onClick={refetch}
              disabled={loading}
              aria-label="Refresh combos"
              className="p-1.5 rounded-full text-muted hover:text-brand-black hover:bg-gray-100 transition-colors disabled:opacity-40"
            >
              <ArrowPathIcon
                width={18}
                height={18}
                className={loading ? 'animate-spin' : ''}
              />
            </button>
          </div>
        </div>

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

      <div className="max-w-md mx-auto px-4 pt-4">
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
              {selectedPeriod} isn't served at this dining hall today.
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
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 animate-pulse">
          <div className="flex justify-between">
            <div className="h-4 bg-gray-200 rounded-full w-2/3" />
            <div className="h-4 bg-gray-200 rounded-full w-16" />
          </div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded-full" />
            <div className="h-3 bg-gray-200 rounded-full w-4/5" />
          </div>
          <div className="flex gap-2">
            <div className="h-5 bg-gray-200 rounded-full w-16" />
            <div className="h-5 bg-gray-200 rounded-full w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}
