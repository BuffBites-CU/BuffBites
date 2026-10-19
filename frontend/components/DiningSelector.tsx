'use client'

import { useState } from 'react'
import { DINING_HALLS, DINING_HALL_LABELS, type DiningHall } from '@/types'
import { ChevronDownIcon } from './icons'

interface Props {
  selected: DiningHall
  onChange: (hall: DiningHall) => void
}

export default function DiningSelector({ selected, onChange }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 rounded-xl bg-surface-card shadow-soft px-3.5 py-2 text-left hover:bg-surface-overlay transition-colors"
      >
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="plan-label flex-shrink-0">Hall</span>
          <span className="font-display text-[16px] text-brand-black truncate">{DINING_HALL_LABELS[selected]}</span>
        </span>
        <ChevronDownIcon
          width={14}
          height={14}
          className={`text-muted flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 mt-1.5 z-20 rounded-xl bg-surface-card shadow-soft-lg overflow-hidden">
            {DINING_HALLS.map((hall) => (
              <button
                key={hall}
                type="button"
                onClick={() => { onChange(hall); setOpen(false) }}
                className={`w-full px-4 py-2.5 text-left font-display text-[13px] font-semibold tracking-wide transition-colors ${
                  hall === selected
                    ? 'bg-brand/15 text-brand-black'
                    : 'text-brand-black hover:bg-surface-overlay/60'
                }`}
              >
                {DINING_HALL_LABELS[hall]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
