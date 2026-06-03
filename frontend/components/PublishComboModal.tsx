'use client'

import { useEffect, useState } from 'react'
import { XMarkIcon, PlusIcon } from './icons'
import { tagStyle } from './ComboCard'
import { publishCombo } from '@/services/communityService'
import { getMenu } from '@/services/combosService'
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
}

type FieldErrors = Partial<Record<'dining_hall' | 'date' | 'title' | 'dishes', string>>

const EMPTY_DISH: DishItem = { name: '', station: '', servings: 1 }

function haptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10)
}

export default function PublishComboModal({ onClose, onSuccess }: Props) {
  const { firebaseUser, username } = useAuth()
  const [step, setStep] = useState<1 | 2>(1)
  const [form, setForm] = useState<FormState>({
    dining_hall: '',
    date: TODAY,
    title: '',
    description: '',
    tags: [],
    dishes: [{ ...EMPTY_DISH }, { ...EMPTY_DISH }],
    notes: '',
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [menuByStation, setMenuByStation] = useState<Record<string, string[]>>({})
  const [menuLoading, setMenuLoading] = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    if (!form.dining_hall || !form.date) {
      setMenuByStation({})
      return
    }
    setMenuLoading(true)
    getMenu(form.dining_hall as DiningHall, form.date)
      .then((data) => {
        const byStation: Record<string, string[]> = {}
        for (const [station, items] of Object.entries(data.categories)) {
          byStation[station] = items.map((it) => it.name)
        }
        setMenuByStation(byStation)
      })
      .catch(() => setMenuByStation({}))
      .finally(() => setMenuLoading(false))
  }, [form.dining_hall, form.date])

  function updateDish(index: number, field: keyof DishItem, value: string | number) {
    setForm((f) => ({
      ...f,
      dishes: f.dishes.map((d, i) => i === index ? { ...d, [field]: value } : d),
    }))
  }

  function updateDishFromSelect(index: number, name: string) {
    const station = Object.entries(menuByStation).find(([, names]) => names.includes(name))?.[0] ?? ''
    setForm((f) => ({
      ...f,
      dishes: f.dishes.map((d, i) => i === index ? { ...d, name, station } : d),
    }))
  }

  function changeDiningHall(hall: DiningHall | '') {
    setForm((f) => ({
      ...f,
      dining_hall: hall,
      dishes: [{ ...EMPTY_DISH }, { ...EMPTY_DISH }],
    }))
    if (hall) setFieldErrors((e) => ({ ...e, dining_hall: undefined }))
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

  function validateStep1(): boolean {
    const errors: FieldErrors = {}
    if (!form.dining_hall) errors.dining_hall = 'Please select a dining hall.'
    if (!form.date) errors.date = 'Please select a date.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  function validateStep2(): boolean {
    const errors: FieldErrors = {}
    if (!form.title.trim()) errors.title = 'Give your combo a title.'
    const validDishes = form.dishes.filter((d) => d.name.trim())
    if (validDishes.length < 1) errors.dishes = 'Add at least one dish.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handlePublish() {
    if (!firebaseUser || !username || !form.dining_hall) return
    if (!validateStep2()) return
    haptic()
    setSubmitting(true)
    setSubmitError('')
    try {
      const token = await firebaseUser.getIdToken()
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
        token,
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

  const hasMenu = Object.keys(menuByStation).length > 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onMouseDown={onClose} />

      <div className="relative bg-white rounded-t-3xl max-h-[92vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Step progress */}
        <div className="flex items-center justify-between px-5 py-2 flex-shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <span className={step >= 1 ? 'text-brand-gold font-semibold' : 'text-muted'}>
              ① Hall &amp; Date
            </span>
            <span className="text-gray-300">→</span>
            <span className={step >= 2 ? 'text-brand-gold font-semibold' : 'text-muted'}>
              ② Combo Details
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <XMarkIcon width={20} height={20} className="text-muted" />
          </button>
        </div>

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
                  onChange={(e) => changeDiningHall(e.target.value as DiningHall | '')}
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm bg-white text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-gold ${
                    fieldErrors.dining_hall ? 'border-red-300' : 'border-gray-200'
                  }`}
                >
                  <option value="">Select a dining hall…</option>
                  {DINING_HALLS.map((h) => (
                    <option key={h} value={h}>{DINING_HALL_LABELS[h]}</option>
                  ))}
                </select>
                {fieldErrors.dining_hall && (
                  <p className="text-xs text-red-500 mt-1">{fieldErrors.dining_hall}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-brand-black block mb-1.5">Date</label>
                <input
                  type="date"
                  max={TODAY}
                  value={form.date}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, date: e.target.value }))
                    setFieldErrors((err) => ({ ...err, date: undefined }))
                  }}
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-gold ${
                    fieldErrors.date ? 'border-red-300' : 'border-gray-200'
                  }`}
                />
                {fieldErrors.date && (
                  <p className="text-xs text-red-500 mt-1">{fieldErrors.date}</p>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 pt-2">
              <h2 className="text-xl font-bold text-brand-black">What did you make?</h2>

              <div>
                <label className="text-sm font-medium text-brand-black block mb-1.5">
                  Dining Hall
                </label>
                <select
                  value={form.dining_hall}
                  onChange={(e) => changeDiningHall(e.target.value as DiningHall | '')}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-gold"
                >
                  <option value="">Select a dining hall…</option>
                  {DINING_HALLS.map((h) => (
                    <option key={h} value={h}>{DINING_HALL_LABELS[h]}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-sm font-medium text-brand-black">Title</label>
                  <span className="text-xs text-muted">{form.title.length}/60</span>
                </div>
                <input
                  maxLength={60}
                  value={form.title}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, title: e.target.value }))
                    setFieldErrors((err) => ({ ...err, title: undefined }))
                  }}
                  placeholder="e.g. The Midnight Special"
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm text-brand-black placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold ${
                    fieldErrors.title ? 'border-red-300' : 'border-gray-200'
                  }`}
                />
                {fieldErrors.title && (
                  <p className="text-xs text-red-500 mt-1">{fieldErrors.title}</p>
                )}
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

              <div>
                <label className="text-sm font-medium text-brand-black block mb-2">Tags</label>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                        form.tags.includes(tag) ? tagStyle(tag) : 'bg-gray-100 text-muted'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-brand-black">Dishes</label>
                  {menuLoading && <span className="text-xs text-muted">Loading menu…</span>}
                </div>
                <div className="space-y-2">
                  {form.dishes.map((dish, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      {hasMenu ? (
                        <select
                          value={dish.name}
                          onChange={(e) => updateDishFromSelect(i, e.target.value)}
                          className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-brand-black bg-white focus:outline-none focus:ring-2 focus:ring-brand-gold"
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
                          onChange={(e) => updateDish(i, 'name', e.target.value)}
                          placeholder={menuLoading ? 'Loading…' : 'Dish name'}
                          disabled={menuLoading}
                          className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-brand-black placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold disabled:opacity-50"
                        />
                      )}
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={dish.servings}
                        onChange={(e) => updateDish(i, 'servings', Number(e.target.value))}
                        className="w-12 rounded-xl border border-gray-200 px-2 py-2 text-sm text-center text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-gold"
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
                {fieldErrors.dishes && (
                  <p className="text-xs text-red-500 mt-1">{fieldErrors.dishes}</p>
                )}
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

              {submitError && (
                <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{submitError}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep((s) => (s - 1) as 1 | 2)}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-brand-black hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
          )}
          {step < 2 ? (
            <button
              onClick={() => { if (validateStep1()) setStep(2) }}
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
