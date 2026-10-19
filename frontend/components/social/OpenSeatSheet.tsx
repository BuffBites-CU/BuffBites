'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { openTable } from '@/services/socialService'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { currentMealPeriodMST, isoOffsetMST } from '@/lib/date'
import { MEAL_PERIODS, type DiningHall, type DiningTable, type MealPeriod } from '@/types'
import InterestChips from './InterestChips'
import { XMarkIcon } from '../icons'

interface Props {
  open: boolean
  halls: Array<{ key: DiningHall; label: string }>
  interests: Array<{ key: string; label: string }>
  myInterests: string[]
  defaultHall: DiningHall
  onClose: () => void
  onOpened: (t: DiningTable) => void
}

const SEATS = [2, 3, 4, 5, 6]

const segBtn = (on: boolean) =>
  `flex-1 py-2 text-[13px] font-semibold ${on ? 'bg-brand-black text-white' : 'text-brand-black'}`

/** "Open a seat": host a table at a hall for a meal. */
export default function OpenSeatSheet({ open, halls, interests, myInterests, defaultHall, onClose, onOpened }: Props) {
  const [hall, setHall] = useState<DiningHall>(defaultHall)
  const [day, setDay] = useState<0 | 1>(0)
  const [period, setPeriod] = useState<MealPeriod>(currentMealPeriodMST())
  const [time, setTime] = useState('')
  const [seats, setSeats] = useState(4)
  const [tags, setTags] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  useBodyScrollLock(open)
  useEffect(() => {
    if (!open) return
    setHall(defaultHall); setError(''); setTags(myInterests.slice(0, 3))
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // Re-seed only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function submit() {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const t = await openTable({ dining: hall, date: isoOffsetMST(day), period, time: time || undefined, interests: tags, note: note.trim(), seats })
      onOpened(t)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the table.')
    } finally {
      setSaving(false)
    }
  }

  if (!open || !mounted) return null
  // Your interests first; any interest works for a table.
  const ordered = [...interests].sort((a, b) => Number(myInterests.includes(b.key)) - Number(myInterests.includes(a.key)))

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-black/50" role="dialog" aria-modal="true" aria-labelledby="open-seat-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md max-h-[92dvh] overflow-y-auto overscroll-contain bg-surface rounded-t-[28px] shadow-soft-lg p-4 animate-page-in"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
        <div className="flex items-start justify-between">
          <div>
            <span className="plan-label">New table</span>
            <h2 id="open-seat-title" className="text-[28px] leading-none text-brand-black mt-1">Open a seat</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-10 h-10 -mr-2 flex items-center justify-center rounded-full hover:bg-surface-overlay">
            <XMarkIcon width={20} height={20} />
          </button>
        </div>
        <div className="dim-line mt-2 mb-3" aria-hidden />

        <div className="space-y-3.5">
          <label className="block">
            <span className="plan-label">Where</span>
            <select value={hall} onChange={(e) => setHall(e.target.value as DiningHall)}
              className="mt-1 w-full rounded-lg border-[1.5px] border-brand-black bg-surface px-2.5 py-2 text-[16px] text-brand-black">
              {halls.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
            </select>
          </label>

          <div>
            <span className="plan-label">When</span>
            <div className="mt-1 flex overflow-hidden rounded-lg ring-[1.5px] ring-brand-black" role="group" aria-label="Day">
              <button type="button" aria-pressed={day === 0} onClick={() => setDay(0)} className={segBtn(day === 0)}>Today</button>
              <button type="button" aria-pressed={day === 1} onClick={() => setDay(1)} className={segBtn(day === 1)}>Tomorrow</button>
            </div>
            <div className="mt-2 flex overflow-hidden rounded-lg ring-[1.5px] ring-brand-black" role="group" aria-label="Meal">
              {MEAL_PERIODS.map((p) => (
                <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} className={segBtn(period === p)}>{p}</button>
              ))}
            </div>
            <label className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[13px] text-brand-black">Time (optional)</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                className="w-36 rounded-lg border-[1.5px] border-brand-black bg-surface px-2.5 py-1.5 text-[16px] text-brand-black" />
            </label>
          </div>

          <div>
            <span className="plan-label">Table for</span>
            <div className="mt-1 flex overflow-hidden rounded-lg ring-[1.5px] ring-brand-black" role="group" aria-label="People at the table, including you">
              {SEATS.map((n) => (
                <button key={n} type="button" aria-pressed={seats === n} onClick={() => setSeats(n)} className={segBtn(seats === n)}>{n}</button>
              ))}
            </div>
          </div>

          <div>
            <span className="plan-label">Talk about (up to 3)</span>
            <div className="mt-1.5"><InterestChips options={ordered} selected={tags} onChange={setTags} max={3} size="sm" /></div>
          </div>

          <label className="block">
            <span className="plan-label">Note (optional)</span>
            <input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="Window tables, grey hoodie"
              className="mt-1 w-full rounded-lg border-[1.5px] border-brand-black bg-surface px-2.5 py-2 text-[16px] text-brand-black placeholder:text-muted/70" />
          </label>

          {error && <p className="text-[13px] font-semibold text-brand-black" role="alert">{error}</p>}
          <button onClick={submit} disabled={saving}
            className="w-full rounded-xl bg-brand-black py-3 font-display text-[19px] text-white card-press disabled:opacity-50">
            {saving ? 'Opening…' : 'Open my table'}
          </button>
          <p className="text-center text-[11px] text-muted">It closes on its own after the meal. Meet at the hall, not somewhere private.</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
