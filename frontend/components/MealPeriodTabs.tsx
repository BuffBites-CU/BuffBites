'use client'

import { MEAL_PERIODS, type MealPeriod } from '@/types'

const PERIOD_ICONS: Record<MealPeriod, string> = {
  Breakfast: '☀',
  Lunch: '◎',
  Dinner: '◐',
}

interface Props {
  selected: MealPeriod
  onChange: (period: MealPeriod) => void
  counts: Record<MealPeriod, number>
}

export default function MealPeriodTabs({ selected, onChange, counts }: Props) {
  return (
    <div className="flex border-b border-surface-warm">
      {MEAL_PERIODS.map((period) => {
        const active = period === selected
        const hasWarning = counts[period] > 0 && counts[period] < 3
        return (
          <button
            key={period}
            onClick={() => onChange(period)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[13px] font-display font-semibold tracking-wide transition-all border-b-2 -mb-px ${
              active
                ? 'border-brand-gold text-brand-black'
                : 'border-transparent text-muted hover:text-brand-black'
            }`}
          >
            <span className={`text-[11px] transition-all ${active ? 'text-brand-gold' : 'opacity-50'}`}>
              {PERIOD_ICONS[period]}
            </span>
            {period}
            {hasWarning && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" aria-label="fewer combos available" />
            )}
          </button>
        )
      })}
    </div>
  )
}
