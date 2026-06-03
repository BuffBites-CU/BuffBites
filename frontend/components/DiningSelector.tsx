'use client'

import { DINING_HALLS, DINING_HALL_LABELS, type DiningHall } from '@/types'

interface Props {
  selected: DiningHall
  onChange: (hall: DiningHall) => void
}

export default function DiningSelector({ selected, onChange }: Props) {
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide px-4 py-2">
      {DINING_HALLS.map((hall) => {
        const active = hall === selected
        return (
          <button
            key={hall}
            onClick={() => onChange(hall)}
            className={`flex-shrink-0 rounded-full px-4 py-1.5 text-[13px] font-display font-semibold tracking-wide transition-all ${
              active
                ? 'bg-brand-black text-brand-gold shadow-card-sm'
                : 'bg-surface-overlay text-muted hover:bg-surface-warm hover:text-brand-black'
            }`}
          >
            {DINING_HALL_LABELS[hall]}
          </button>
        )
      })}
    </div>
  )
}
