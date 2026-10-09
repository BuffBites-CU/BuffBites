'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
const NUTRIENTS = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sodium_mg', 'added_sugar_g'] as const
type Nutrient = (typeof NUTRIENTS)[number]

/** One plate row: nutrition for a single serving, plus the chosen portion. */
interface Row {
  id: number
  item: PlateItem
  perServing: Record<Nutrient, number>
  portion: number
}

function toRows(items: PlateItem[]): Row[] {
  return items.map((item, id) => {
    const p = item.portion || 1
    const perServing = Object.fromEntries(NUTRIENTS.map((k) => [k, item[k] / p])) as Record<Nutrient, number>
    return { id, item, perServing, portion: item.portion }
  })
}

const amount = (row: Row, k: Nutrient) => row.perServing[k] * row.portion
const HASH = '#plate'

export default function SnapPlate({ dining, date, period, firebaseUid, calorieTarget }: Props) {
  const { showToast } = useToast()
  const { firebaseUser } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const requestId = useRef(0)
  const previewRef = useRef<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<PlateAnalysis | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState('')
  const [logState, setLogState] = useState<'idle' | 'logging' | 'logged'>('idle')
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  function setPreviewUrl(url: string | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = url
    setPreview(url)
  }

  // Free the photo blob if the page unmounts with the sheet open.
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current) }, [])

  const open = phase !== 'idle'

  // Like ComboDetail: a history entry so the phone's back button closes the
  // sheet instead of leaving the page and losing a scan that was already paid for.
  useEffect(() => {
    if (!open) return
    window.history.pushState(null, '', HASH)
    const onPop = () => reset()
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (window.location.hash === HASH) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const totals = useMemo(() => {
    const t = {} as Record<Nutrient, number>
    for (const k of NUTRIENTS) t[k] = Math.round(rows.reduce((acc, r) => acc + amount(r, k), 0))
    return t
  }, [rows])
  const fuel = fuelScore(
    { calories: totals.calories, protein_g: totals.protein_g, carbs_g: totals.carbs_g, fat_g: totals.fat_g },
    calorieTarget,
  )

  function pickPhoto() {
    // Clearing the value lets the same file be picked again after an error.
    if (inputRef.current) inputRef.current.value = ''
    inputRef.current?.click()
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    const id = ++requestId.current
    setPhase('reading')
    setError('')
    setLogState('idle')
    setResult(null)
    setRows([])
    setPreviewUrl(URL.createObjectURL(file))
    try {
      if (!firebaseUser) throw new Error('Sign in to scan your plate.')
      const [b64, token] = await Promise.all([photoToJpegBase64(file), firebaseUser.getIdToken()])
      const res = await analyzePlate(b64, dining, date, token)
      if (id !== requestId.current) return // closed, or a newer photo was picked
      setResult(res)
      setRows(toRows(res.items))
      setPhase('result')
    } catch (e) {
      if (id !== requestId.current) return
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setPhase('error')
    }
  }

  function reset() {
    requestId.current++ // drop any response still in flight
    setPreviewUrl(null)
    setResult(null)
    setRows([])
    setPhase('idle')
    setLogState('idle')
    if (inputRef.current) inputRef.current.value = ''
  }

  function close() {
    if (window.location.hash === HASH) window.history.back() // popstate → reset()
    else reset()
  }

  async function handleLog() {
    if (!firebaseUid || rows.length === 0 || logState !== 'idle') return
    setLogState('logging') // set before the await so a double tap can't log twice
    const names = rows.map((r) => r.item.name)
    try {
      await logMeal(firebaseUid, {
        title: `📸 ${names.slice(0, 2).join(' + ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`,
        calories: totals.calories,
        protein_g: totals.protein_g,
        carbs_g: totals.carbs_g,
        fat_g: totals.fat_g,
        date,
        dining_hall: dining,
        meal_period: period,
      })
      setLogState('logged')
      showToast(`Logged ${totals.calories} cal`, 'success')
    } catch {
      setLogState('idle')
      showToast('Failed to log meal', 'error')
    }
  }

  const sheet = (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-black/50" role="dialog" aria-modal="true" aria-label="Plate scan">
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto overscroll-contain bg-surface rounded-t-3xl border-t-2 border-x-2 border-brand-black p-4 animate-page-in"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-brush text-2xl text-brand-black leading-none">Your plate</h2>
          <button onClick={close} aria-label="Close" className="w-10 h-10 -mr-2 flex items-center justify-center rounded-full hover:bg-surface-overlay">
            <XMarkIcon width={20} height={20} />
          </button>
        </div>

        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Your plate" className="w-full h-44 object-cover rounded-2xl border-2 border-brand-black mb-3" />
        )}

        {phase === 'reading' && (
          <div className="flex flex-col items-center gap-2 py-6 text-center" role="status">
            <span className="text-3xl animate-wiggle" aria-hidden>🍽</span>
            <p className="text-sm font-semibold text-brand-black">Reading your plate…</p>
            <p className="text-xs text-muted">Matching it against {DINING_HALL_LABELS[dining]}&apos;s menu today</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="py-6 text-center" role="alert">
            <p className="text-sm text-brand-black font-medium">{error}</p>
            <button onClick={pickPhoto} className="mt-3 px-4 py-2.5 rounded-xl bg-brand text-brand-black text-sm font-semibold">
              Try another photo
            </button>
          </div>
        )}

        {phase === 'result' && result && !result.is_food && (
          <p className="py-6 text-center text-sm text-brand-black">{result.notes || "That doesn't look like a meal."}</p>
        )}

        {phase === 'result' && result?.is_food && (
          <>
            <div className="rounded-2xl bg-brand border-2 border-brand-black shadow-sticker p-3 mb-3" aria-live="polite">
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
              {rows.map((row) => (
                <li key={row.id} className="bg-surface-card rounded-xl border border-surface-warm px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 pt-1">
                      <p className="text-[13px] font-semibold text-brand-black truncate">
                        {row.item.name}
                        {row.item.confidence === 'low' && <span className="ml-1 text-[11px] font-medium text-brand-deep">· check this</span>}
                      </p>
                      <p className="text-[11px] text-muted">
                        {Math.round(amount(row, 'calories'))} cal · {Math.round(amount(row, 'protein_g'))}g P · {row.item.station}
                      </p>
                    </div>
                    <button
                      onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                      aria-label={`Remove ${row.item.name}`}
                      className="w-9 h-9 -mr-1.5 flex-shrink-0 flex items-center justify-center rounded-full text-muted hover:bg-surface-overlay"
                    >
                      <XMarkIcon width={16} height={16} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2" role="group" aria-label={`Portion of ${row.item.name}`}>
                    {PORTIONS.map((p) => {
                      const selected = Math.abs(row.portion - p) < 0.01
                      return (
                        <button
                          key={p}
                          aria-pressed={selected}
                          onClick={() => setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, portion: p } : r)))}
                          className={`min-w-[44px] h-8 px-2 rounded-full text-[12px] font-semibold ${
                            selected ? 'bg-brand-black text-brand' : 'bg-surface-overlay text-brand-black'
                          }`}
                        >
                          {p}×
                        </button>
                      )
                    })}
                    {/* Keep the AI's own estimate selectable when it isn't one of the chips. */}
                    {!PORTIONS.some((p) => Math.abs(row.item.portion - p) < 0.01) && (
                      <button
                        aria-pressed={Math.abs(row.portion - row.item.portion) < 0.01}
                        aria-label={`${row.item.portion}× (estimate)`}
                        onClick={() => setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, portion: r.item.portion } : r)))}
                        className={`min-w-[44px] h-8 px-2 rounded-full text-[12px] font-semibold ${
                          Math.abs(row.portion - row.item.portion) < 0.01 ? 'bg-brand-black text-brand' : 'bg-surface-overlay text-brand-black'
                        }`}
                      >
                        {row.item.portion}×
                      </button>
                    )}
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
              disabled={logState !== 'idle' || rows.length === 0 || !firebaseUid}
              className="w-full py-3 rounded-2xl bg-brand-black text-brand font-display font-bold disabled:opacity-60"
            >
              {logState === 'logged' ? '✓ Logged' : logState === 'logging' ? 'Logging…' : `Log ${period.toLowerCase()} · ${totals.calories} cal`}
            </button>
            <p className="text-[10px] text-center text-muted mt-2">
              Estimates from CU Dining&apos;s posted nutrition × AI portion guess. Photos aren&apos;t stored.
            </p>
          </>
        )}
      </div>
    </div>
  )

  return (
    <>
      <button
        onClick={pickPhoto}
        className="w-full mb-5 flex items-center gap-3 rounded-2xl bg-brand-black text-white px-4 py-3 border-2 border-brand-black shadow-sticker active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-transform"
      >
        <span className="text-2xl" aria-hidden>📸</span>
        <span className="flex-1 text-left">
          <span className="block font-display font-bold text-[15px] text-brand">Snap your plate</span>
          <span className="block text-[12px] text-surface-warm/90">AI reads your tray and logs the macros from today&apos;s menu</span>
        </span>
      </button>
      {/* No `capture` attribute: phones then offer both Camera and Photo Library. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      {/* Portal to <body>: the page column is animated (transform), which would
          otherwise trap this fixed overlay inside the scrolling content. */}
      {open && mounted && createPortal(sheet, document.body)}
    </>
  )
}
