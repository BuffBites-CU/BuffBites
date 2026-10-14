'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { disconnectStrava, getBodyStats, getStravaStatus, saveBodyStats } from '@/services/coachService'
import { parseApiDate } from '@/lib/date'
import type { BodySex, BodyStats, StravaStatus } from '@/types'
import Doodle from './Doodle'
import StravaConsent from './StravaConsent'
import WorkoutLog from './WorkoutLog'

const LB_PER_KG = 2.20462
const CM_PER_IN = 2.54

type Units = 'us' | 'metric'

interface Form {
  weight: string
  heightA: string // ft, or cm
  heightB: string // in (US only)
  age: string
  sex: BodySex | ''
}

function toForm(b: BodyStats, units: Units): Form {
  const totalIn = b.height_cm ? b.height_cm / CM_PER_IN : null
  return {
    weight: b.weight_kg ? String(Math.round(units === 'us' ? b.weight_kg * LB_PER_KG : b.weight_kg)) : '',
    heightA: totalIn == null ? '' : units === 'us' ? String(Math.floor(Math.round(totalIn) / 12)) : String(Math.round(b.height_cm!)),
    heightB: totalIn == null || units === 'metric' ? '' : String(Math.round(totalIn) % 12),
    age: b.age ? String(b.age) : '',
    sex: b.sex ?? '',
  }
}

function fromForm(f: Form, units: Units): BodyStats {
  const n = (v: string) => (v.trim() === '' ? null : Number(v))
  const w = n(f.weight)
  const a = n(f.heightA)
  const b = n(f.heightB) ?? 0
  const height = a == null ? null : units === 'us' ? (a * 12 + b) * CM_PER_IN : a
  return {
    weight_kg: w == null ? null : Math.round((units === 'us' ? w / LB_PER_KG : w) * 10) / 10,
    height_cm: height == null ? null : Math.round(height),
    age: n(f.age),
    sex: f.sex || null,
  }
}

function validate(b: BodyStats): string {
  if (b.weight_kg != null && !(b.weight_kg >= 30 && b.weight_kg <= 250)) return 'Check your weight.'
  if (b.height_cm != null && !(b.height_cm >= 120 && b.height_cm <= 230)) return 'Check your height.'
  if (b.age != null && !(Number.isInteger(b.age) && b.age >= 16 && b.age <= 90)) return 'Age must be 16–90.'
  return ''
}

const inputCls =
  'w-full rounded-lg border-[1.5px] border-brand-black bg-surface px-2.5 py-2 text-[15px] text-brand-black ' +
  'placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand-black/30'

/**
 * Profile section: the opt-in Strava link and the body stats behind the fuel
 * coach's calorie target. Both are private to the student.
 */
export default function TrainingLink() {
  const { firebaseUser } = useAuth()
  const { showToast } = useToast()
  const [status, setStatus] = useState<StravaStatus | null>(null)
  const [consentOpen, setConsentOpen] = useState(false)
  const [confirmOff, setConfirmOff] = useState(false)
  const [busy, setBusy] = useState(false)
  const [units, setUnits] = useState<Units>('us')
  const [saved, setSaved] = useState<BodyStats>({ weight_kg: null, height_cm: null, age: null, sex: null })
  const [form, setForm] = useState<Form>(() => toForm(saved, 'us'))
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!firebaseUser) return
    let alive = true
    firebaseUser.getIdToken().then((token) => Promise.allSettled([getStravaStatus(token), getBodyStats(token)]))
      .then(([s, b]) => {
        if (!alive) return
        if (s.status === 'fulfilled') setStatus(s.value)
        if (b.status === 'fulfilled') {
          setSaved(b.value)
          setForm(toForm(b.value, 'us'))
        }
      })
      .catch(() => {})
    return () => { alive = false }
  }, [firebaseUser])

  function switchUnits(next: Units) {
    if (next === units) return
    // Convert what's typed, not what's saved, so edits aren't lost.
    const current = fromForm(form, units)
    setUnits(next)
    setForm({ ...toForm(current, next), sex: form.sex })
  }

  async function saveBody() {
    if (!firebaseUser || saving) return
    const body = fromForm(form, units)
    const err = validate(body)
    setFormError(err)
    if (err) return
    setSaving(true)
    try {
      const out = await saveBodyStats(await firebaseUser.getIdToken(), body)
      setSaved(out)
      showToast('Saved. Your fuel target is updated.', 'success')
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  async function disconnect() {
    if (!firebaseUser || busy) return
    setBusy(true)
    try {
      setStatus(await disconnectStrava(await firebaseUser.getIdToken()))
      showToast('Strava disconnected and its data deleted.', 'neutral')
    } catch {
      showToast('Could not disconnect. Try again.', 'error')
    } finally {
      setBusy(false)
      setConfirmOff(false)
    }
  }

  const dirty = JSON.stringify(fromForm(form, units)) !== JSON.stringify(fromForm(toForm(saved, units), units))
  const since = status?.connected_at
    ? parseApiDate(status.connected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : ''

  return (
    <section aria-labelledby="training-title">
      <span className="plan-label">Sec. T · Private</span>
      <h2 id="training-title" className="text-[24px] text-brand-black leading-tight">Training &amp; fuel</h2>
      <div className="dim-line mt-1.5 mb-3" aria-hidden />
      <Link href="/fuel-info" className="mb-3 inline-block text-[12px] text-brand-black underline underline-offset-2">How fuel plans work</Link>

      <WorkoutLog />

      {/* Strava link: shown once the server has Strava keys, or while checking */}
      {(status == null || status.available || status.connected) && (
      <div className="card mt-3 p-3.5 flex items-center gap-3">
        <Doodle name="shoe" size={44} draw={false} className="text-brand-black flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[19px] leading-tight text-brand-black">Strava</p>
          <p className="text-[12px] leading-snug text-muted">
            {status == null
              ? 'Checking…'
              : status.connected
                ? `Connected${status.athlete_name ? ` as ${status.athlete_name}` : ''}${since ? ` · since ${since}` : ''}`
                : status.available
                  ? 'Off. Workouts add to your daily calorie target.'
                  : "Strava linking isn't set up on this server yet."}
          </p>
        </div>
        {status?.connected ? (
          <button
            onClick={() => setConfirmOff(true)}
            className="flex-shrink-0 rounded-lg px-3 py-2 text-[13px] font-semibold text-brand-black ring-[1.5px] ring-brand-black card-press"
          >
            Disconnect
          </button>
        ) : status?.available ? (
          <button
            onClick={() => setConsentOpen(true)}
            className="flex-shrink-0 rounded-lg bg-brand-black px-3 py-2 text-[13px] font-semibold text-white card-press"
          >
            Connect
          </button>
        ) : null}
      </div>
      )}

      {confirmOff && (
        <div className="card mt-2 p-3.5 hatch" role="alertdialog" aria-label="Disconnect Strava">
          <p className="text-[13px] text-brand-black">
            Disconnect Strava? We&apos;ll revoke access at Strava and delete your workouts and cached plans here.
          </p>
          <div className="mt-2.5 flex gap-2">
            <button onClick={() => setConfirmOff(false)} className="flex-1 rounded-lg bg-surface py-2 text-[13px] font-semibold text-brand-black ring-[1.5px] ring-brand-black">
              Keep it
            </button>
            <button onClick={disconnect} disabled={busy} className="flex-1 rounded-lg bg-brand-black py-2 text-[13px] font-semibold text-white disabled:opacity-50">
              {busy ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        </div>
      )}

      {/* Body stats */}
      <div className="card mt-3 p-3.5">
        <div className="flex items-center justify-between">
          <span className="plan-label !text-brand-black">Body stats</span>
          <div className="flex text-[11px] font-mono uppercase tracking-wider ring-[1.5px] ring-brand-black rounded-md overflow-hidden" role="group" aria-label="Units">
            {(['us', 'metric'] as const).map((u) => (
              <button
                key={u}
                onClick={() => switchUnits(u)}
                aria-pressed={units === u}
                className={`px-2 py-1 ${units === u ? 'bg-brand-black text-white' : 'text-brand-black'}`}
              >
                {u === 'us' ? 'lb · ft' : 'kg · cm'}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className="text-[11px] text-muted">Weight ({units === 'us' ? 'lb' : 'kg'})</span>
            <input inputMode="decimal" className={inputCls} value={form.weight} placeholder={units === 'us' ? '150' : '68'}
              onChange={(e) => setForm({ ...form, weight: e.target.value.replace(/[^\d.]/g, '') })} />
          </label>
          <label className="block">
            <span className="text-[11px] text-muted">Age</span>
            <input inputMode="numeric" className={inputCls} value={form.age} placeholder="20"
              onChange={(e) => setForm({ ...form, age: e.target.value.replace(/\D/g, '') })} />
          </label>
          {units === 'us' ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] text-muted">Height (ft)</span>
                <input inputMode="numeric" className={inputCls} value={form.heightA} placeholder="5"
                  onChange={(e) => setForm({ ...form, heightA: e.target.value.replace(/\D/g, '') })} />
              </label>
              <label className="block">
                <span className="text-[11px] text-muted">(in)</span>
                <input inputMode="numeric" className={inputCls} value={form.heightB} placeholder="9"
                  onChange={(e) => setForm({ ...form, heightB: e.target.value.replace(/\D/g, '') })} />
              </label>
            </div>
          ) : (
            <label className="block">
              <span className="text-[11px] text-muted">Height (cm)</span>
              <input inputMode="numeric" className={inputCls} value={form.heightA} placeholder="172"
                onChange={(e) => setForm({ ...form, heightA: e.target.value.replace(/\D/g, '') })} />
            </label>
          )}
          <label className="block">
            <span className="text-[11px] text-muted">Sex (for the formula)</span>
            <select className={inputCls} value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value as BodySex | '' })}>
              <option value="">Not set</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="unspecified">Prefer not to say</option>
            </select>
          </label>
        </div>

        {formError && <p className="mt-2 text-[12px] font-semibold text-brand-black" role="alert">{formError}</p>}
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted leading-snug">Only used to estimate your daily calories. Never shown on your profile.</p>
          <button
            onClick={saveBody}
            disabled={!dirty || saving}
            className="flex-shrink-0 rounded-lg bg-brand-black px-4 py-2 text-[13px] font-semibold text-white card-press disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <StravaConsent open={consentOpen} onClose={() => setConsentOpen(false)} />
    </section>
  )
}
