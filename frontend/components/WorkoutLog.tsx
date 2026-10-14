'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { addWorkout, deleteWorkout, listWorkouts } from '@/services/coachService'
import { isoOffsetMST, isoToLocalNoon } from '@/lib/date'
import type { WorkoutEffort, WorkoutRecord } from '@/types'
import Doodle from './Doodle'
import { XMarkIcon } from './icons'

// Same keys as energy.MANUAL_SPORTS on the server.
const SPORTS: Array<[string, string]> = [
  ['Run', 'Run'], ['Walk', 'Walk'], ['Hike', 'Hike'], ['Ride', 'Bike ride'], ['Swim', 'Swim'],
  ['WeightTraining', 'Weights'], ['HighIntensityIntervalTraining', 'HIIT'], ['Yoga', 'Yoga'],
  ['Elliptical', 'Elliptical'], ['Rowing', 'Rowing'], ['RockClimbing', 'Climbing'], ['Soccer', 'Soccer'],
  ['Basketball', 'Basketball'], ['Tennis', 'Tennis'], ['Pickleball', 'Pickleball'], ['Dance', 'Dance'],
  ['Workout', 'Other workout'],
]
const WITH_DISTANCE = new Set(['Run', 'Walk', 'Hike', 'Ride'])
const EFFORTS: Array<[WorkoutEffort, string]> = [['light', 'Easy'], ['moderate', 'Steady'], ['hard', 'Hard']]
const KM_PER_MI = 1.60934

const inputCls =
  'w-full rounded-lg border-[1.5px] border-brand-black bg-surface px-2.5 py-2 text-[15px] text-brand-black ' +
  'placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand-black/30'

function dayLabel(iso: string, i: number) {
  if (i === 0) return 'Today'
  if (i === 1) return 'Yesterday'
  return isoToLocalNoon(iso).toLocaleDateString('en-US', { weekday: 'long' })
}

/**
 * Log a workout by hand. It counts toward today's calorie target the same way
 * a Strava workout does, so Strava isn't needed.
 */
export default function WorkoutLog() {
  const { firebaseUser } = useAuth()
  const { showToast } = useToast()
  const [items, setItems] = useState<WorkoutRecord[]>([])
  const [open, setOpen] = useState(false)
  const [sport, setSport] = useState('Run')
  const [dayIdx, setDayIdx] = useState(0)
  const [time, setTime] = useState('')
  const [minutes, setMinutes] = useState('')
  const [miles, setMiles] = useState('')
  const [effort, setEffort] = useState<WorkoutEffort>('moderate')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  const days = Array.from({ length: 7 }, (_, i) => isoOffsetMST(-i))

  useEffect(() => {
    if (!firebaseUser) return
    let alive = true
    firebaseUser.getIdToken().then(listWorkouts).then((w) => { if (alive) setItems(w) }).catch(() => {})
    return () => { alive = false }
  }, [firebaseUser])

  async function save() {
    if (!firebaseUser || saving) return
    const mins = Number(minutes)
    if (!(mins >= 5 && mins <= 720)) { setError('Enter 5 to 720 minutes.'); return }
    const mi = miles.trim() === '' ? 0 : Number(miles)
    if (!(mi >= 0 && mi <= 186)) { setError('Check the distance.'); return }
    setError('')
    setSaving(true)
    try {
      const rec = await addWorkout(await firebaseUser.getIdToken(), {
        sport,
        date: days[dayIdx],
        start_time: time || undefined,
        minutes: mins,
        distance_km: WITH_DISTANCE.has(sport) ? Math.round(mi * KM_PER_MI * 100) / 100 : 0,
        effort,
      })
      setItems((prev) => [rec, ...prev].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)))
      setMinutes(''); setMiles(''); setTime(''); setOpen(false)
      showToast('Workout added. Your fuel target is updated.', 'success')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!firebaseUser || removing) return
    setRemoving(id)
    try {
      await deleteWorkout(await firebaseUser.getIdToken(), id)
      setItems((prev) => prev.filter((w) => w.id !== id))
    } catch {
      showToast('Could not delete that workout.', 'error')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="card p-3.5">
      <div className="flex items-center gap-3">
        <Doodle name="shoe" size={44} draw={false} className="text-brand-black flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[19px] leading-tight text-brand-black">Workouts</p>
          <p className="text-[12px] leading-snug text-muted">Log what you did; it adds to your daily calorie target.</p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex-shrink-0 rounded-lg bg-brand-black px-3 py-2 text-[13px] font-semibold text-white card-press"
        >
          {open ? 'Close' : 'Log'}
        </button>
      </div>

      {open && (
        <div className="mt-3 grid grid-cols-2 gap-2.5 animate-pop-in">
          <label className="block">
            <span className="text-[11px] text-muted">Activity</span>
            <select className={inputCls} value={sport} onChange={(e) => setSport(e.target.value)}>
              {SPORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-muted">Day</span>
            <select className={inputCls} value={dayIdx} onChange={(e) => setDayIdx(Number(e.target.value))}>
              {days.map((d, i) => <option key={d} value={i}>{dayLabel(d, i)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-muted">Minutes</span>
            <input inputMode="numeric" className={inputCls} value={minutes} placeholder="45"
              onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label className="block">
            <span className="text-[11px] text-muted">Start time (optional)</span>
            <input type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          {WITH_DISTANCE.has(sport) && (
            <label className="block col-span-2">
              <span className="text-[11px] text-muted">Distance in miles (optional)</span>
              <input inputMode="decimal" className={inputCls} value={miles} placeholder="3.1"
                onChange={(e) => setMiles(e.target.value.replace(/[^\d.]/g, ''))} />
            </label>
          )}
          <div className="col-span-2">
            <span className="text-[11px] text-muted">How hard did it feel?</span>
            <div className="mt-1 flex text-[13px] font-semibold ring-[1.5px] ring-brand-black rounded-lg overflow-hidden" role="group" aria-label="Effort">
              {EFFORTS.map(([k, label]) => (
                <button key={k} onClick={() => setEffort(k)} aria-pressed={effort === k}
                  className={`flex-1 py-2 ${effort === k ? 'bg-brand-black text-white' : 'text-brand-black'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="col-span-2 text-[12px] font-semibold text-brand-black" role="alert">{error}</p>}
          <button onClick={save} disabled={saving}
            className="col-span-2 rounded-lg bg-brand-black py-2.5 font-display text-[18px] text-white card-press disabled:opacity-50">
            {saving ? 'Saving…' : 'Add workout'}
          </button>
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-brand-black/15 border-t border-brand-black/15">
          {items.map((w) => (
            <li key={w.id} className="flex items-center gap-2 py-2 text-[13px] text-brand-black">
              <span className="min-w-0 flex-1 truncate">
                <b>{w.label}</b> · {Math.round(w.minutes)} min{w.distance_km ? ` · ${(w.distance_km / KM_PER_MI).toFixed(1)} mi` : ''}
                <span className="text-muted"> · {w.date === days[0] ? 'today' : w.date === days[1] ? 'yesterday' : w.date.slice(5).replace('-', '/')}</span>
              </span>
              <button onClick={() => remove(w.id)} disabled={removing === w.id} aria-label={`Delete ${w.label} workout`}
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-surface-overlay disabled:opacity-40">
                <XMarkIcon width={14} height={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
