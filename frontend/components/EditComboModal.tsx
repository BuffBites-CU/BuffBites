'use client'

import { useEffect, useState } from 'react'
import { XMarkIcon, PlusIcon } from './icons'
import { tagStyle } from './ComboCard'
import { updateCombo } from '@/services/communityService'
import { useAuth } from '@/context/AuthContext'
import type { ComboTag, CommunityCombo, DishItem } from '@/types'

const AVAILABLE_TAGS: ComboTag[] = ['vegan', 'vegetarian', 'high-protein', 'light', 'hearty', 'balanced']

interface Props {
  combo: CommunityCombo
  onClose: () => void
  onSaved: (updated: CommunityCombo) => void
}

export default function EditComboModal({ combo, onClose, onSaved }: Props) {
  const { firebaseUser } = useAuth()
  const [title, setTitle] = useState(combo.title)
  const [description, setDescription] = useState(combo.description ?? '')
  const [tags, setTags] = useState<ComboTag[]>(combo.tags)
  const [dishes, setDishes] = useState<DishItem[]>(combo.dishes)
  const [notes, setNotes] = useState(combo.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  function toggleTag(tag: ComboTag) {
    setTags((t) => t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag])
  }

  function updateDish(i: number, field: keyof DishItem, value: string | number) {
    setDishes((prev) => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d))
  }

  function addDish() {
    if (dishes.length >= 8) return
    setDishes((prev) => [...prev, { name: '', station: '', servings: 1 }])
  }

  function removeDish(i: number) {
    if (dishes.length <= 1) return
    setDishes((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    if (!firebaseUser) return
    if (!title.trim()) { setError('Title is required.'); return }
    const validDishes = dishes.filter((d) => d.name.trim())
    if (validDishes.length < 1) { setError('Add at least one dish.'); return }

    setSaving(true)
    setError('')
    try {
      const token = await firebaseUser.getIdToken()
      const updated = await updateCombo(combo.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        tags,
        dishes: validDishes,
        notes: notes.trim() || undefined,
      }, token)
      onSaved(updated)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onMouseDown={onClose} />

      <div className="relative bg-white rounded-t-2xl max-h-[92vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="flex items-center justify-between px-5 py-2 flex-shrink-0">
          <h2 className="text-lg font-bold text-brand-black">Edit Combo</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors">
            <XMarkIcon width={20} height={20} className="text-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4 pt-2">
          {/* Title */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-sm font-medium text-brand-black">Title</label>
              <span className="text-xs text-muted">{title.length}/60</span>
            </div>
            <input
              maxLength={60}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-gold"
            />
          </div>

          {/* Description */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-sm font-medium text-brand-black">
                Description <span className="text-muted font-normal">(optional)</span>
              </label>
              <span className="text-xs text-muted">{description.length}/200</span>
            </div>
            <textarea
              maxLength={200}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Why does this combo work?"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-brand-black placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold resize-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-sm font-medium text-brand-black block mb-2">Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                    tags.includes(tag) ? tagStyle(tag) : 'bg-gray-100 text-muted'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Dishes */}
          <div>
            <label className="text-sm font-medium text-brand-black block mb-2">Dishes</label>
            <div className="space-y-2">
              {dishes.map((dish, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={dish.name}
                    onChange={(e) => updateDish(i, 'name', e.target.value)}
                    placeholder="Dish name"
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-brand-black placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold"
                  />
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={dish.servings}
                    onChange={(e) => updateDish(i, 'servings', Number(e.target.value))}
                    className="w-12 rounded-lg border border-gray-200 px-2 py-2 text-sm text-center text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-gold"
                  />
                  <button
                    onClick={() => removeDish(i)}
                    disabled={dishes.length <= 1}
                    className="flex-shrink-0 p-1.5 rounded-full hover:bg-gray-100 disabled:opacity-30 transition-colors"
                  >
                    <XMarkIcon width={16} height={16} className="text-muted" />
                  </button>
                </div>
              ))}
            </div>
            {dishes.length < 8 && (
              <button onClick={addDish} className="flex items-center gap-1.5 mt-2 text-sm text-brand-gold font-medium">
                <PlusIcon width={16} height={16} />
                Add dish
              </button>
            )}
          </div>

          {/* Notes */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-sm font-medium text-brand-black">
                Notes <span className="text-muted font-normal">(optional)</span>
              </label>
              <span className="text-xs text-muted">{notes.length}/300</span>
            </div>
            <textarea
              maxLength={300}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any tips or context?"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-brand-black placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-brand-black hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-brand-gold text-brand-black text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
