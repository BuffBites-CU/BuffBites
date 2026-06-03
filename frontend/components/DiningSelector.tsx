'use client'

import { DINING_HALLS, DINING_HALL_LABELS, type DiningHall } from '@/types'

interface Props {
  selected: DiningHall
  onChange: (hall: DiningHall) => void
}

export default function DiningSelector({ selected, onChange }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 py-2">
      {DINING_HALLS.map((hall) => {
        const active = hall === selected
        return (
          <button
            key={hall}
            onClick={() => onChange(hall)}
            className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              active
                ? 'border border-brand-gold text-brand-gold bg-white'
                : 'border border-transparent bg-gray-100 text-muted hover:bg-gray-200'
            }`}
          >
            {DINING_HALL_LABELS[hall]}
          </button>
        )
      })}
    </div>
  )
}
