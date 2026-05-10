'use client'

import { useEffect, useRef, useState } from 'react'
import { XMarkIcon, PlusIcon, PhotoIcon } from './icons'
import { tagStyle } from './ComboCard'
import { publishCombo } from '@/services/communityService'
import { useAuth } from '@/context/AuthContext'
import { DINING_HALLS, DINING_HALL_LABELS, type ComboTag, type DiningHall, type DishItem } from '@/types'

const AVAILABLE_TAGS: ComboTag[] = ['vegan', 'vegetarian', 'high-protein', 'light', 'hearty', 'balanced']
const TODAY = new Date().toISOString().split('T')[0]

interface Props {
  onClose: () => void
  onSuccess: () => void
}

interface FormState {
  dining_hall: DiningHall | ''
  date: string
  title: string
  description: string
  tags: ComboTag[]
  dishes: DishItem[]
  notes: string
  images: string[]
}

const EMPTY_DISH: DishItem = { name: '', station: '', servings: 1 }

export default function PublishComboModal({ onClose, onSuccess }: Props) {
  const { firebaseUid, username } = useAuth()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [form, setForm] = useState<FormState>({
    dining_hall: '',
    date: TODAY,
    title: '',
    description: '',
    tags: [],
    dishes: [{ ...EMPTY_DISH }, { ...EMPTY_DISH }],
    notes: '',
    images: [],
  })
  const [step1Error, setStep1Error] = useState('')
  const [step2Error, setStep2Error] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  function updateDish(index: number, field: keyof DishItem, value: string | number) {
    setForm((f) => ({
      ...f,
      dishes: f.dishes.map((d, i) => i === index ? { ...d, [field]: value } : d),
    }))
  }

  function addDish() {
    if (form.dishes.length >= 8) return
    setForm((f) => ({ ...f, dishes: [...f.dishes, { ...EMPTY_DISH }] }))
  }

  function removeDish(index: number) {
    if (form.dishes.length <= 1) return
    setForm((f) => ({ ...f, dishes: f.dishes.filter((_, i) => i !== index) }))
  }

  function toggleTag(tag: ComboTag) {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 3 - form.images.length)
    const urls = files.map((f) => URL.createObjectURL(f))
    setForm((f) => ({ ...f, images: [...f.images, ...urls].slice(0, 3) }))
  }

  function validateStep1(): boolean {
    if (!form.dining_hall) { setStep1Error('Please select a dining hall.'); return false }
    if (!form.date) { setStep1Error('Please select a date.'); return false }
    setStep1Error('')
    return true
  }

  function validateStep2(): boolean {
    if (!form.title.trim()) { setStep2Error('Give your combo a title.'); return false }
    const validDishes = form.dishes.filter((d) => d.name.trim())
    if (validDishes.length < 1) { setStep2Error('Add at least one dish.'); return false }
    setStep2Error('')
    return true
  }

  async function handlePublish() {
    if (!firebaseUid || !username || !form.dining_hall) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await publishCombo(
        {
          title: form.title.trim(),
          dining_hall: form.dining_hall,
          date: form.date,
          dishes: form.dishes.filter((d) => d.name.trim()),
          tags: form.tags,
          description: form.description.trim() || undefined,
          images: [],
          notes: form.notes.trim() || undefined,
        },
        firebaseUid,
        username,
      )
      onSuccess()
      onClose()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to publish')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onMouseDown={onClose} />

      <div className="relative bg-white rounded-t-2xl max-h-[92vh] flex flex-col">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Step dots + close */}
        <div className="flex items-center justify-between px-5 py-2 flex-shrink-0">
          <div className="flex gap-1.5">
            {([1, 2, 3] as const).map((s) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all duration-200 ${
                  s <= step ? 'w-5 bg-brand-gold' : 'w-2 bg-gray-200'
                }`}
              />
            ))}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <XMarkIcon width={20} height={20} className="text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {step === 1 && (
            <div className="space-y-4 pt-2">
              <h2 className="text-xl font-bold text-brand-black">Where and when?</h2>

              <div>
                <label className="text-sm font-medium text-brand-black block mb-1.5">
                  Dining Hall
                </label>
                <select
                  value={form.dining_hall}
                  onChange={(e) => setForm((f) => ({ ...f, dining_hall: e.target.value as DiningHall }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-gold"
                >
                  <option value="">Select a dining hall…</option>
                  {DINING_HALLS.map((h) => (
                    <option key={h} value={h}>{DINING_HALL_LABELS[h]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-brand-black block mb-1.5">Date</label>
                <input
                  type="date"
                  max={TODAY}
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-gold"
                />
              </div>

              {step1Error && <p className="text-sm text-red-500">{step1Error}</p>}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 pt-2">
              <h2 className="text-xl font-bold text-brand-black">What did you make?</h2>

              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-sm font-medium text-brand-black">Title</label>
                  <span className="text-xs text-muted">{form.title.length}/60</span>
                </div>
                <input
                  maxLength={60}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. The Midnight Special"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-brand-black placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-sm font-medium text-brand-black">Description <span className="text-muted font-normal">(optional)</span></label>
                  <span className="text-xs text-muted">{form.description.length}/200</span>
                </div>
                <textarea
                  maxLength={200}
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
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
                        form.tags.includes(tag)
                          ? tagStyle(tag)
                          : 'bg-gray-100 text-muted'
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
                  {form.dishes.map((dish, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        value={dish.name}
                        onChange={(e) => updateDish(i, 'name', e.target.value)}
                        placeholder="Dish name"
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-brand-black placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold"
                      />
                      <input
                        value={dish.station}
                        onChange={(e) => updateDish(i, 'station', e.target.value)}
                        placeholder="Station"
                        className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm text-brand-black placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold"
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
                        disabled={form.dishes.length <= 1}
                        className="flex-shrink-0 p-1.5 rounded-full hover:bg-gray-100 disabled:opacity-30 transition-colors"
                        aria-label="Remove dish"
                      >
                        <XMarkIcon width={16} height={16} className="text-muted" />
                      </button>
                    </div>
                  ))}
                </div>
                {form.dishes.length < 8 && (
                  <button
                    onClick={addDish}
                    className="flex items-center gap-1.5 mt-2 text-sm text-brand-gold font-medium"
                  >
                    <PlusIcon width={16} height={16} />
                    Add dish
                  </button>
                )}
              </div>

              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-sm font-medium text-brand-black">Notes <span className="text-muted font-normal">(optional)</span></label>
                  <span className="text-xs text-muted">{form.notes.length}/300</span>
                </div>
                <textarea
                  maxLength={300}
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Any tips or context?"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-brand-black placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold resize-none"
                />
              </div>

              {step2Error && <p className="text-sm text-red-500">{step2Error}</p>}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 pt-2">
              <div>
                <h2 className="text-xl font-bold text-brand-black">Add photos</h2>
                <p className="text-sm text-muted mt-1">Optional — show others what your combo looks like (max 3)</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />

              {form.images.length < 3 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-2 text-muted hover:border-brand-gold transition-colors"
                >
                  <PhotoIcon width={28} height={28} />
                  <span className="text-sm">Tap to add photos</span>
                </button>
              )}

              {form.images.length > 0 && (
                <div className="flex gap-3 overflow-x-auto scrollbar-hide">
                  {form.images.map((src, i) => (
                    <div key={i} className="relative flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => setForm((f) => ({ ...f, images: f.images.filter((_, j) => j !== i) }))}
                        className="absolute top-1 right-1 bg-black/50 rounded-full p-0.5"
                        aria-label="Remove photo"
                      >
                        <XMarkIcon width={12} height={12} className="text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {submitError && (
                <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{submitError}</p>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-brand-black hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={() => {
                if (step === 1 && !validateStep1()) return
                if (step === 2 && !validateStep2()) return
                setStep((s) => (s + 1) as 2 | 3)
              }}
              className="flex-1 py-3 rounded-xl bg-brand-gold text-brand-black text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handlePublish}
              disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-brand-gold text-brand-black text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {submitting ? 'Publishing…' : 'Publish'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
