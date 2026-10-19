'use client'

interface Props {
  options: Array<{ key: string; label: string }>
  selected: string[]
  onChange: (next: string[]) => void
  max: number
  /** Keys to mark as "in common" (filled) without making them selectable. */
  size?: 'sm' | 'md'
}

/** Pick up to `max` interests. Selected chips are inverted, like the nav. */
export default function InterestChips({ options, selected, onChange, max, size = 'md' }: Props) {
  const full = selected.length >= max
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Pick up to ${max}`}>
      {options.map(({ key, label }) => {
        const on = selected.includes(key)
        const disabled = !on && full
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(on ? selected.filter((k) => k !== key) : [...selected, key])}
            className={`rounded-md ring-[1.5px] ring-brand-black transition-colors disabled:opacity-35 ${
              size === 'sm' ? 'px-2 py-1 text-[12px]' : 'px-2.5 py-1.5 text-[13px]'
            } ${on ? 'bg-brand-black text-white' : 'bg-surface text-brand-black'}`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
