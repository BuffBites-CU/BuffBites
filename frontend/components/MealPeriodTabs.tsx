'use client'

import { MEAL_PERIODS, type MealPeriod } from '@/types'

interface Props {
  selected: MealPeriod
  onChange: (period: MealPeriod) => void
  counts: Record<MealPeriod, number>
}

export default function MealPeriodTabs({ selected, onChange, counts }: Props) {
  return (
    <div className="flex border-b border-gray-100">
      {MEAL_PERIODS.map((period) => {
        const active = period === selected
        const hasWarning = counts[period] > 0 && counts[period] < 3
        return (
          <button
            key={period}
            onClick={() => onChange(period)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              active
                ? 'border-brand-gold text-brand-gold'
                : 'border-transparent text-muted hover:text-brand-black'
            }`}
          >
            {period}
            {hasWarning && (
              <span className="w-2 h-2 rounded-full bg-yellow-400" aria-label="fewer combos available" />
            )}
          </button>
        )
      })}
    </div>
  )
}
