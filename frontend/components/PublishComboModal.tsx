'use client'

import { useEffect, useRef, useState } from 'react'
import { XMarkIcon } from './icons'
import { DishListEditor, TagPicker, EMPTY_DISH, cleanDishes } from './ComboFormFields'
import { publishCombo } from '@/services/communityService'
import { getMenu } from '@/services/combosService'
import { useAuth } from '@/context/AuthContext'
import { DINING_HALLS, DINING_HALL_LABELS, type ComboTag, type DiningHall, type DishItem } from '@/types'
import { todayMST } from '@/lib/date'

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

function haptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10)
}

export default function PublishComboModal({ onClose, onSuccess }: Props) {
  const { firebaseUser } = useAuth()
  // Taken when the modal opens, so a tab left open past midnight still offers today.
  const [today] = useState(todayMST)
  const [step, setStep] = useState<1 | 2>(1)
  const [form, setForm] = useState<FormState>({
    dining_hall: '',
    date: today,
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

  function changeDiningHall(hall: DiningHall | '') {
    setForm((f) => ({
      ...f,
      dining_hall: hall,
      dishes: [{ ...EMPTY_DISH }, { ...EMPTY_DISH }],
    }))
    if (hall) setFieldErrors((e) => ({ ...e, dining_hall: undefined }))
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
    if (cleanDishes(form.dishes).length < 1) errors.dishes = 'Add at least one dish.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handlePublish() {
    if (!firebaseUser || !form.dining_hall) return
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
          dishes: cleanDishes(form.dishes),
          tags: form.tags,
          description: form.description.trim() || undefined,
          images: [],
          notes: form.notes.trim() || undefined,
        },
        token,
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

      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Share a combo" tabIndex={-1} className="relative outline-none bg-white rounded-t-3xl max-h-[92vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-surface-warm" />
        </div>

        {/* Step progress */}
        <div className="flex items-center justify-between px-5 py-2 flex-shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <span className={step >= 1 ? 'text-brand-deep font-semibold' : 'text-muted'}>
              ① Hall &amp; Date
            </span>
            <span className="text-muted">→</span>
            <span className={step >= 2 ? 'text-brand-deep font-semibold' : 'text-muted'}>
              ② Combo Details
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-overlay transition-colors"
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
                  aria-invalid={!!fieldErrors.dining_hall}
                  className="w-full rounded-xl border border-brand-black/25 px-3 py-2.5 text-sm bg-white text-brand-black focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="">Select a dining hall…</option>
                  {DINING_HALLS.map((h) => (
                    <option key={h} value={h}>{DINING_HALL_LABELS[h]}</option>
                  ))}
                </select>
                {fieldErrors.dining_hall && (
                  <p className="text-xs text-brand-black mt-1">{fieldErrors.dining_hall}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-brand-black block mb-1.5">Date</label>
                <input
                  type="date"
                  max={today}
                  value={form.date}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, date: e.target.value }))
                    setFieldErrors((err) => ({ ...err, date: undefined }))
                  }}
                  aria-invalid={!!fieldErrors.date}
                  className="w-full rounded-xl border border-brand-black/25 px-3 py-2.5 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-brand"
                />
                {fieldErrors.date && (
                  <p className="text-xs text-brand-black mt-1">{fieldErrors.date}</p>
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
                  className="w-full rounded-xl border border-brand-black/25 px-3 py-2.5 text-sm bg-white text-brand-black focus:outline-none focus:ring-2 focus:ring-brand"
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
                  aria-invalid={!!fieldErrors.title}
                  className="w-full rounded-xl border border-brand-black/25 px-3 py-2.5 text-sm text-brand-black placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
                />
                {fieldErrors.title && (
                  <p className="text-xs text-brand-black mt-1">{fieldErrors.title}</p>
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
                  className="w-full rounded-xl border border-brand-black/25 px-3 py-2.5 text-sm text-brand-black placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand resize-none"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-brand-black block mb-2">Tags</label>
                <TagPicker tags={form.tags} onChange={(tags) => setForm((f) => ({ ...f, tags }))} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-brand-black">Dishes</label>
                  {menuLoading && <span className="text-xs text-muted">Loading menu…</span>}
                </div>
                <DishListEditor
                  dishes={form.dishes}
                  onChange={(dishes) => setForm((f) => ({ ...f, dishes }))}
                  menuByStation={menuByStation}
                  menuLoading={menuLoading}
                  error={fieldErrors.dishes}
                />
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
                  className="w-full rounded-xl border border-brand-black/25 px-3 py-2.5 text-sm text-brand-black placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand resize-none"
                />
              </div>

              {submitError && (
                <p className="text-sm text-brand-black bg-surface-overlay rounded-xl px-4 py-3">{submitError}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 px-5 py-4 border-t border-brand-black/25 flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep((s) => (s - 1) as 1 | 2)}
              className="flex-1 py-3 rounded-xl border border-brand-black/25 text-sm font-medium text-brand-black hover:bg-surface-overlay transition-colors"
            >
              Back
            </button>
          )}
          {step < 2 ? (
            <button
              onClick={() => { if (validateStep1()) setStep(2) }}
              className="flex-1 py-3 rounded-xl bg-brand text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handlePublish}
              disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-brand text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {submitting ? 'Publishing…' : 'Publish'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
