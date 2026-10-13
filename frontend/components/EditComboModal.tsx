'use client'

import { useEffect, useRef, useState } from 'react'
import { XMarkIcon } from './icons'
import { DishListEditor, TagPicker, cleanDishes } from './ComboFormFields'
import { updateCombo } from '@/services/communityService'
import { useAuth } from '@/context/AuthContext'
import type { ComboTag, CommunityCombo, DishItem } from '@/types'

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
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus({ preventScroll: true })
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function handleSave() {
    if (!firebaseUser) return
    if (!title.trim()) { setError('Title is required.'); return }
    const validDishes = cleanDishes(dishes)
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

      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="edit-combo-title" tabIndex={-1} className="relative outline-none bg-white rounded-t-2xl max-h-[92vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-surface-warm" />
        </div>

        <div className="flex items-center justify-between px-5 py-2 flex-shrink-0">
          <h2 id="edit-combo-title" className="text-lg font-bold text-brand-black">Edit Combo</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-surface-overlay transition-colors" aria-label="Close">
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
              className="w-full rounded-xl border border-brand-black/25 px-3 py-2.5 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-brand"
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
              className="w-full rounded-xl border border-brand-black/25 px-3 py-2.5 text-sm text-brand-black placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand resize-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-sm font-medium text-brand-black block mb-2">Tags</label>
            <TagPicker tags={tags} onChange={setTags} />
          </div>

          {/* Dishes */}
          <div>
            <label className="text-sm font-medium text-brand-black block mb-2">Dishes</label>
            <DishListEditor dishes={dishes} onChange={setDishes} />
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
              className="w-full rounded-xl border border-brand-black/25 px-3 py-2.5 text-sm text-brand-black placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand resize-none"
            />
          </div>

          {error && <p className="text-sm text-brand-black">{error}</p>}
        </div>

        <div className="flex-shrink-0 px-5 py-4 border-t border-brand-black/25 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-brand-black/25 text-sm font-medium text-brand-black hover:bg-surface-overlay transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-brand text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
