'use client'

import { useMemo, useRef, useState } from 'react'
import { analyzePlate, photoToJpegBase64 } from '@/services/visionService'
import { logMeal } from '@/services/usersService'
import { useToast } from '@/context/ToastContext'
import { useAuth } from '@/context/AuthContext'
import { fuelScore } from '@/lib/nutrition'
import { XMarkIcon } from './icons'
import { DINING_HALL_LABELS } from '@/types'
import type { DiningHall, MealPeriod, PlateAnalysis, PlateItem } from '@/types'

interface Props {
  dining: DiningHall
  date: string
  period: MealPeriod
  firebaseUid: string | null
  calorieTarget?: number
}

type Phase = 'idle' | 'reading' | 'result' | 'error'

const PORTIONS = [0.5, 1, 1.5, 2, 3]

/** Rescale one item's nutrition when the student corrects the portion. */
function withPortion(item: PlateItem, portion: number): PlateItem {
  const f = portion / item.portion
  return {
    ...item,
    portion,
    calories: Math.round(item.calories * f),
    protein_g: +(item.protein_g * f).toFixed(1),
    carbs_g: +(item.carbs_g * f).toFixed(1),
    fat_g: +(item.fat_g * f).toFixed(1),
    fiber_g: +(item.fiber_g * f).toFixed(1),
    sodium_mg: Math.round(item.sodium_mg * f),
    added_sugar_g: +(item.added_sugar_g * f).toFixed(1),
  }
}

export default function SnapPlate({ dining, date, period, firebaseUid, calorieTarget }: Props) {
  const { showToast } = useToast()
  const { firebaseUser } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<PlateAnalysis | null>(null)
  const [items, setItems] = useState<PlateItem[]>([])
  const [error, setError] = useState('')
  const [logged, setLogged] = useState(false)

  const totals = useMemo(() => {
    const sum = (k: keyof PlateItem) => items.reduce((acc, i) => acc + (i[k] as number), 0)
    return {
      calories: Math.round(sum('calories')),
      protein_g: Math.round(sum('protein_g')),
      carbs_g: Math.round(sum('carbs_g')),
      fat_g: Math.round(sum('fat_g')),
      fiber_g: Math.round(sum('fiber_g')),
      sodium_mg: Math.round(sum('sodium_mg')),
      added_sugar_g: Math.round(sum('added_sugar_g')),
    }
  }, [items])
  const fuel = fuelScore(
    { calories: totals.calories, protein_g: totals.protein_g, carbs_g: totals.carbs_g, fat_g: totals.fat_g },
    calorieTarget,
  )

  async function onFile(file: File | undefined) {
    if (!file) return
    setPhase('reading')
    setError('')
    setLogged(false)
    setPreview(URL.createObjectURL(file))
    try {
      if (!firebaseUser) throw new Error('Sign in to scan your plate.')
      const [b64, token] = await Promise.all([photoToJpegBase64(file), firebaseUser.getIdToken()])
      const res = await analyzePlate(b64, dining, date, token)
      setResult(res)
      setItems(res.items)
      setPhase('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setPhase('error')
    }
  }

  function close() {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setResult(null)
    setItems([])
    setPhase('idle')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleLog() {
    if (!firebaseUid || items.length === 0) return
    try {
      await logMeal(firebaseUid, {
        title: `📸 ${items.slice(0, 2).map((i) => i.name).join(' + ')}${items.length > 2 ? ` +${items.length - 2}` : ''}`,
        calories: totals.calories,
        protein_g: totals.protein_g,
        carbs_g: totals.carbs_g,
        fat_g: totals.fat_g,
        date,
        dining_hall: dining,
        meal_period: period,
      })
      setLogged(true)
      showToast(`Logged ${totals.calories} cal`, 'success')
    } catch {
      showToast('Failed to log meal', 'error')
    }
  }

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        className="w-full mb-5 flex items-center gap-3 rounded-2xl bg-brand-black text-white px-4 py-3 border-2 border-brand-black shadow-sticker active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-transform"
      >
        <span className="text-2xl" aria-hidden>📸</span>
        <span className="flex-1 text-left">
          <span className="block font-display font-bold text-[15px] text-brand">Snap your plate</span>
          <span className="block text-[12px] text-surface-warm/90">AI reads your tray and logs the macros from today&apos;s menu</span>
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      {phase !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-black/50" role="dialog" aria-modal="true" aria-label="Plate scan">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-surface rounded-t-3xl border-t-2 border-x-2 border-brand-black p-4 pb-8 animate-page-in"
            style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-brush text-2xl text-brand-black leading-none">Your plate</h2>
              <button onClick={close} aria-label="Close" className="p-1.5 rounded-full hover:bg-surface-overlay">
                <XMarkIcon width={20} height={20} />
              </button>
            </div>

            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Your plate" className="w-full h-44 object-cover rounded-2xl border-2 border-brand-black mb-3" />
            )}

            {phase === 'reading' && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <span className="text-3xl animate-wiggle" aria-hidden>🍽</span>
                <p className="text-sm font-semibold text-brand-black">Reading your plate…</p>
                <p className="text-xs text-muted">Matching it against {DINING_HALL_LABELS[dining]}&apos;s menu today</p>
              </div>
            )}

            {phase === 'error' && (
              <div className="py-6 text-center">
                <p className="text-sm text-brand-black font-medium">{error}</p>
                <button onClick={() => inputRef.current?.click()} className="mt-3 px-4 py-2 rounded-xl bg-brand text-brand-black text-sm font-semibold">
                  Try another photo
                </button>
              </div>
            )}

            {phase === 'result' && result && !result.is_food && (
              <p className="py-6 text-center text-sm text-brand-black">{result.notes || "That doesn't look like a meal."}</p>
            )}

            {phase === 'result' && result?.is_food && (
              <>
                <div className="rounded-2xl bg-brand border-2 border-brand-black shadow-sticker p-3 mb-3">
                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-2xl font-bold text-brand-black">{totals.calories} cal</span>
                    {fuel && <span className="text-sm font-display font-bold text-brand-black">{fuel.emoji} {fuel.label} · {fuel.score}</span>}
                  </div>
                  <p className="text-[13px] text-brand-black mt-0.5">
                    <b>{totals.protein_g}g</b> protein · {totals.carbs_g}g carbs · {totals.fat_g}g fat · {totals.fiber_g}g fiber
                  </p>
                  {(totals.sodium_mg > 1000 || totals.added_sugar_g > 15) && (
                    <p className="text-[11px] text-brand-black/80 mt-1">
                      {totals.sodium_mg > 1000 && <>🧂 {totals.sodium_mg} mg sodium </>}
                      {totals.added_sugar_g > 15 && <>🍬 {totals.added_sugar_g}g added sugar</>}
                    </p>
                  )}
                </div>

                <ul className="space-y-2 mb-3">
                  {items.map((item, idx) => (
                    <li key={item.name} className="bg-surface-card rounded-xl border border-surface-warm px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-brand-black truncate">
                            {item.name}
                            {item.confidence === 'low' && <span className="ml-1 text-[10px] font-medium text-brand-deep">· check this</span>}
                          </p>
                          <p className="text-[11px] text-muted">{item.calories} cal · {item.protein_g}g P · {item.station}</p>
                        </div>
                        <button
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label={`Remove ${item.name}`}
                          className="text-muted p-0.5"
                        >
                          <XMarkIcon width={14} height={14} />
                        </button>
                      </div>
                      <div className="flex gap-1 mt-1.5" role="group" aria-label={`Portion of ${item.name}`}>
                        {PORTIONS.map((p) => (
                          <button
                            key={p}
                            onClick={() => setItems((prev) => prev.map((it, i) => (i === idx ? withPortion(it, p) : it)))}
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              Math.abs(item.portion - p) < 0.01 ? 'bg-brand-black text-brand' : 'bg-surface-overlay text-brand-black'
                            }`}
                          >
                            {p}×
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>

                {result.unmatched.length > 0 && (
                  <p className="text-[11px] text-muted mb-3">
                    Not on today&apos;s menu, so not counted: {result.unmatched.map((u) => u.description).join(', ')}
                  </p>
                )}
                {result.notes && <p className="text-[12px] text-brand-black mb-3">💬 {result.notes}</p>}

                <button
                  onClick={handleLog}
                  disabled={logged || items.length === 0 || !firebaseUid}
                  className="w-full py-3 rounded-2xl bg-brand-black text-brand font-display font-bold disabled:opacity-60"
                >
                  {logged ? '✓ Logged' : `Log ${period.toLowerCase()} · ${totals.calories} cal`}
                </button>
                <p className="text-[10px] text-center text-muted mt-2">
                  Estimates from CU Dining&apos;s posted nutrition × AI portion guess. Photos aren&apos;t stored.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
