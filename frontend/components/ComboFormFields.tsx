'use client'

import { XMarkIcon, PlusIcon } from './icons'
import { TAG_CLASS } from './ComboCard'
import type { ComboTag, DishItem } from '@/types'

// Form pieces shared by PublishComboModal and EditComboModal.

const AVAILABLE_TAGS: ComboTag[] = ['vegan', 'vegetarian', 'high-protein', 'light', 'hearty', 'balanced']
const MAX_DISHES = 8
const MAX_SERVINGS = 5

export const EMPTY_DISH: DishItem = { name: '', station: '', servings: 1 }

/** Whole servings from 1 to MAX_SERVINGS (the API takes whole numbers from 1). */
function clampServings(servings: number): number {
  return Math.min(MAX_SERVINGS, Math.max(1, Math.round(servings) || 1))
}

/** The dishes to send: rows with a name, with servings pulled into range. */
export function cleanDishes(dishes: DishItem[]): DishItem[] {
  return dishes
    .filter((d) => d.name.trim())
    .map((d) => ({ ...d, servings: clampServings(d.servings) }))
}

export function TagPicker({ tags, onChange }: { tags: ComboTag[]; onChange: (tags: ComboTag[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {AVAILABLE_TAGS.map((tag) => {
        const on = tags.includes(tag)
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? tags.filter((t) => t !== tag) : [...tags, tag])}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
              on ? TAG_CLASS : 'bg-surface-overlay text-muted'
            }`}
          >
            {tag}
          </button>
        )
      })}
    </div>
  )
}

interface DishListEditorProps {
  dishes: DishItem[]
  onChange: (dishes: DishItem[]) => void
  /** The day's menu as dish names by station. When it has entries, each row picks from it. */
  menuByStation?: Record<string, string[]>
  menuLoading?: boolean
  error?: string
}

export function DishListEditor({ dishes, onChange, menuByStation = {}, menuLoading = false, error }: DishListEditorProps) {
  const hasMenu = Object.keys(menuByStation).length > 0

  function updateDish(index: number, changes: Partial<DishItem>) {
    onChange(dishes.map((d, i) => (i === index ? { ...d, ...changes } : d)))
  }

  function pickFromMenu(index: number, name: string) {
    const station = Object.entries(menuByStation).find(([, names]) => names.includes(name))?.[0] ?? ''
    updateDish(index, { name, station })
  }

  return (
    <>
      <div className="space-y-2">
        {dishes.map((dish, i) => (
          <div key={i} className="flex gap-2 items-center">
            {hasMenu ? (
              <select
                value={dish.name}
                onChange={(e) => pickFromMenu(i, e.target.value)}
                aria-label={`Dish ${i + 1}`}
                className="flex-1 rounded-xl border border-brand-black/25 px-3 py-2 text-sm text-brand-black bg-white focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="">Select a dish…</option>
                {Object.entries(menuByStation).map(([station, names]) => (
                  <optgroup key={station} label={station}>
                    {names.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            ) : (
              <input
                value={dish.name}
                onChange={(e) => updateDish(i, { name: e.target.value })}
                placeholder={menuLoading ? 'Loading…' : 'Dish name'}
                disabled={menuLoading}
                aria-label={`Dish ${i + 1}`}
                className="flex-1 rounded-xl border border-brand-black/25 px-3 py-2 text-sm text-brand-black placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
              />
            )}
            <input
              type="number"
              min={1}
              max={MAX_SERVINGS}
              step={1}
              value={dish.servings}
              onChange={(e) => updateDish(i, { servings: Number(e.target.value) })}
              onBlur={() => updateDish(i, { servings: clampServings(dish.servings) })}
              aria-label={`Servings of dish ${i + 1}`}
              className="w-12 rounded-xl border border-brand-black/25 px-2 py-2 text-sm text-center text-brand-black focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <button
              type="button"
              onClick={() => onChange(dishes.filter((_, idx) => idx !== i))}
              disabled={dishes.length <= 1}
              className="flex-shrink-0 p-1.5 rounded-full hover:bg-surface-overlay disabled:opacity-30 transition-colors"
              aria-label={`Remove dish ${i + 1}`}
            >
              <XMarkIcon width={16} height={16} className="text-muted" />
            </button>
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-brand-black mt-1">{error}</p>}
      {dishes.length < MAX_DISHES && (
        <button
          type="button"
          onClick={() => onChange([...dishes, { ...EMPTY_DISH }])}
          className="flex items-center gap-1.5 mt-2 text-sm text-brand-deep font-medium"
        >
          <PlusIcon width={16} height={16} />
          Add dish
        </button>
      )}
    </>
  )
}
