'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { buildFuelPlan, getFuelBudget } from '@/services/coachService'
import { isoOffsetMST } from '@/lib/date'
import { DINING_HALL_LABELS } from '@/types'
import type { DiningHall, FuelBudget, FuelPlan } from '@/types'
import Doodle from './Doodle'

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

function signed(n: number) {
  return `${n < 0 ? '−' : '+'} ${fmt(Math.abs(n))}`
}

/**
 * Discover card: today's calorie target (free, computed on the server from body
 * stats and Strava workouts) and, on tap, a meal plan from the selected hall
 * built by the fuel coach. The plan is a paid AI call, so it never runs on load.
 */
export default function FuelPlanCard({ dining }: { dining: DiningHall }) {
  const { firebaseUser } = useAuth()
  const [budget, setBudget] = useState<FuelBudget | null>(null)
  const [plan, setPlan] = useState<FuelPlan | null>(null)
  const [planning, setPlanning] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const today = isoOffsetMST(0)

  useEffect(() => {
    if (!firebaseUser) return
    let alive = true
    firebaseUser.getIdToken()
      .then((t) => getFuelBudget(t, today))
      .then((b) => { if (alive) setBudget(b) })
      .catch(() => { if (alive) setBudget(null) })
    return () => { alive = false }
  }, [firebaseUser, today])

  // A plan belongs to one hall; switching halls clears it (and ignores a late reply).
  useEffect(() => {
    requestId.current++
    setPlan(null)
    setPlanning(false)
    setError('')
  }, [dining])

  async function build(date: string) {
    if (!firebaseUser || planning) return
    const id = ++requestId.current
    setPlanning(true)
    setError('')
    try {
      const p = await buildFuelPlan(await firebaseUser.getIdToken(), dining, date)
      if (id !== requestId.current) return
      setPlan(p)
      if (date === today) setBudget(p.budget)
    } catch (e) {
      if (id === requestId.current) setError(e instanceof Error ? e.message : 'Could not build a plan.')
    } finally {
      if (id === requestId.current) setPlanning(false)
    }
  }

  if (!firebaseUser || !budget) return null

  const t = budget.training
  const workout = t.today[0]
  const hall = DINING_HALL_LABELS[dining]

  return (
    <section className="card mb-6 p-4" aria-labelledby="fuel-title">
      <div className="flex items-center justify-between">
        <span className="plan-label !text-brand-black">Fig. 2 · Fuel plan</span>
        <span className="plan-label">Load: {budget.training_load}</span>
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <h2 id="fuel-title" className="sr-only">Today&apos;s fuel plan</h2>
          <p className="font-display text-[38px] leading-none text-brand-black">{fmt(budget.target_kcal)}</p>
          <p className="text-[12px] text-muted mt-1">kcal target today · {fmt(budget.remaining_kcal)} left</p>
        </div>
        <Doodle name="shoe" size={58} className="text-brand-black flex-shrink-0" />
      </div>

      {/* The sum behind the number, like a dimension string on a drawing */}
      <p className="mt-2 font-mono text-[11px] text-brand-black">
        {fmt(budget.baseline_kcal)} daily {signed(budget.exercise_kcal)} training
        {budget.goal_adjust_kcal !== 0 && <> {signed(budget.goal_adjust_kcal)} goal</>}
      </p>
      <div className="dim-line mt-1" aria-hidden />

      <div className="mt-2.5 grid grid-cols-3 text-center">
        {([['Protein', budget.protein_g], ['Carbs', budget.carbs_g], ['Fat', budget.fat_g]] as const).map(([label, g], i) => (
          <div key={label} className={i ? 'border-l border-brand-black/20' : ''}>
            <p className="font-display text-[20px] leading-none text-brand-black">{g}g</p>
            <p className="plan-label mt-1">{label}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[12px] text-brand-black">
        {t.error ? t.error
          : workout ? `${workout.name || workout.sport} ${Math.round(workout.minutes)} min${workout.distance_km ? ` · ${workout.distance_km} km` : ''} · ${fmt(workout.kcal)} kcal${t.today.length > 1 ? ` (+${t.today.length - 1} more)` : ''}`
          : t.connected ? `No workout yet today · ${t.week_sessions} this week`
          : 'Rest-day estimate: no workouts counted.'}
      </p>
      {budget.notes.filter((n) => !n.startsWith('No workouts counted')).slice(0, 1).map((n) => (
        <p key={n} className="mt-1 text-[11px] text-muted">
          {n.startsWith('Rough estimate') ? <>Rough estimate. <Link href="/profile" className="underline underline-offset-2">Add your stats</Link> for a real number.</> : n}
        </p>
      ))}

      {!plan && (
        <button
          onClick={() => build(today)}
          disabled={planning}
          className="mt-3 w-full rounded-xl bg-brand-black py-3 font-display text-[18px] text-white card-press disabled:opacity-60"
        >
          {planning ? `Planning from ${hall}…` : `Build my plan at ${hall}`}
        </button>
      )}
      {planning && (
        <p className="mt-2 text-center text-[11px] text-muted" role="status">The coach drafts meals and checks them against today&apos;s menu. About 20 seconds.</p>
      )}
      {error && <p className="mt-2 text-[13px] font-semibold text-brand-black" role="alert">{error}</p>}

      {plan && <PlanView plan={plan} onTomorrow={() => build(isoOffsetMST(1))} planning={planning} />}
      <div className="mt-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
        <Link href="/fuel-info" className="underline underline-offset-2 text-brand-black">How this works</Link>
        {t.connected && <span>Powered by Strava</span>}
      </div>
    </section>
  )
}

function PlanView({ plan, onTomorrow, planning }: { plan: FuelPlan; onTomorrow: () => void; planning: boolean }) {
  if (plan.meals.length === 0) {
    return (
      <div className="mt-3 hatch card p-3.5">
        <p className="text-[13px] text-brand-black">{plan.headline}</p>
        <button onClick={onTomorrow} disabled={planning} className="mt-2.5 rounded-lg bg-brand-black px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
          {planning ? 'Planning…' : 'Plan tomorrow instead'}
        </button>
      </div>
    )
  }
  const off = plan.planned_kcal ? Math.round(((plan.totals.calories - plan.planned_kcal) / plan.planned_kcal) * 100) : 0
  return (
    <div className="mt-4 animate-pop-in" aria-live="polite">
      <p className="font-display text-[19px] leading-snug text-brand-black">{plan.headline}</p>
      <p className="mt-1 font-mono text-[11px] text-brand-black">
        Plan {fmt(plan.totals.calories)} / {fmt(plan.planned_kcal)} kcal ({off >= 0 ? '+' : ''}{off}%) · {plan.totals.protein_g}g protein
      </p>

      <ol className="mt-3 space-y-2.5">
        {plan.meals.map((m, i) => (
          <li key={m.period} className="rounded-lg ring-[1.5px] ring-brand-black p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="plan-label !text-brand-black">{String(i + 1).padStart(2, '0')} · {m.period}</span>
              <span className="font-mono text-[11px] text-brand-black">{fmt(m.totals.calories)} kcal · {m.totals.protein_g}g P</span>
            </div>
            <p className="font-display text-[19px] leading-tight text-brand-black mt-1">{m.title}</p>
            <ul className="mt-1.5 space-y-0.5">
              {m.items.map((it) => (
                <li key={it.name} className="flex justify-between gap-2 text-[12px] text-brand-black">
                  <span className="min-w-0 truncate">{it.servings !== 1 && <b>{it.servings}× </b>}{it.name}</span>
                  <span className="flex-shrink-0 text-muted">{fmt(it.calories)}</span>
                </li>
              ))}
            </ul>
            {m.why && <p className="mt-1.5 text-[12px] italic text-muted">{m.why}</p>}
          </li>
        ))}
      </ol>

      {plan.tips.length > 0 && (
        <ul className="mt-3 space-y-1">
          {plan.tips.map((tip) => (
            <li key={tip} className="flex gap-2 text-[12px] text-brand-black">
              <span aria-hidden>—</span><span>{tip}</span>
            </li>
          ))}
        </ul>
      )}
      {plan.assumptions.map((a) => <p key={a} className="mt-1.5 text-[11px] text-muted">{a}</p>)}
      <p className="mt-2 text-[10px] text-muted">Numbers come from CU Dining&apos;s posted nutrition. Estimates, not medical advice.</p>
    </div>
  )
}
