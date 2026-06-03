'use client'

import { DINING_HALLS, DINING_HALL_LABELS, type DiningHall } from '@/types'

interface SingleProps {
  mode: 'single'
  selected: DiningHall | undefined
  onChange: (hall: DiningHall | undefined) => void
}

interface MultiProps {
  mode: 'multi'
  selectedMulti: DiningHall[]
  onChangeMulti: (halls: DiningHall[]) => void
}

type Props = SingleProps | MultiProps

function isActive(props: Props, hall: DiningHall): boolean {
  if (props.mode === 'single') return props.selected === hall
  return props.selectedMulti.includes(hall)
}

function isAllActive(props: Props): boolean {
  if (props.mode === 'single') return props.selected === undefined
  return props.selectedMulti.length === 0
}

function handleClick(props: Props, hall: DiningHall) {
  if (props.mode === 'single') {
    props.onChange(props.selected === hall ? undefined : hall)
  } else {
    const next = props.selectedMulti.includes(hall)
      ? props.selectedMulti.filter((h) => h !== hall)
      : [...props.selectedMulti, hall]
    props.onChangeMulti(next)
  }
}

function handleAllClick(props: Props) {
  if (props.mode === 'single') props.onChange(undefined)
  else props.onChangeMulti([])
}

const PILL_ACTIVE = 'border border-brand-gold text-brand-gold bg-white'
const PILL_INACTIVE = 'border border-transparent bg-gray-100 text-muted hover:bg-gray-200'

export default function FilterBar(props: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 py-2">
      <button
        onClick={() => handleAllClick(props)}
        className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
          isAllActive(props) ? PILL_ACTIVE : PILL_INACTIVE
        }`}
      >
        All
      </button>
      {DINING_HALLS.map((hall) => (
        <button
          key={hall}
          onClick={() => handleClick(props, hall)}
          className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            isActive(props, hall) ? PILL_ACTIVE : PILL_INACTIVE
          }`}
        >
          {DINING_HALL_LABELS[hall]}
        </button>
      ))}
    </div>
  )
}
