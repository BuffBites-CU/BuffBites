'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Doodle from '@/components/Doodle'

// Mirrors docs/FUEL_COACH.md ("How the numbers are made"). Keep the two in step.
const METHODS: Array<{ no: string; what: string; how: string; source: string }> = [
  { no: '01', what: 'Resting burn', how: 'Mifflin-St Jeor equation from your weight, height, age and sex.', source: 'Mifflin et al., Am J Clin Nutr, 1990' },
  { no: '02', what: 'Daily movement', how: 'Resting burn × 1.4, which covers walking around campus.', source: 'FAO/WHO activity levels' },
  {
    no: '03',
    what: 'Workouts',
    how: 'From Strava, if you connect it. Power-meter work (kJ ≈ kcal) when your ride has it; otherwise running and walking equations from pace and climb; otherwise a typical value for the sport. Counted net of resting burn so training time isn’t counted twice.',
    source: 'ACSM Guidelines; 2024 Compendium of Physical Activities',
  },
  { no: '04', what: 'Carbs', how: 'From 3 g per kg on a rest day up to 10 g per kg after more than 3 hours of training.', source: 'ACSM/AND/DC position stand, 2016' },
  { no: '05', what: 'Protein', how: '1.4–1.6 g per kg; 1.8 for muscle gain; 2.0 while cutting.', source: 'ISSN protein position stand, 2017' },
  { no: '06', what: 'Fat', how: 'The remainder, kept between 20% and 35% of calories.', source: 'ACSM/AND/DC position stand, 2016' },
  { no: '07', what: 'Weight-loss goal', how: 'A 15% deficit (at most 500 kcal), and never below 1.2 × your resting burn.', source: 'Built-in safety floor' },
]

const KEPT: Array<[string, string]> = [
  ['Strava sign-in (encrypted), first name, consent time', 'Until you disconnect'],
  ['Workouts from Strava', 'In memory for 5 minutes, never saved'],
  ['Built meal plans', '6 hours'],
  ['Body stats', 'Until you change them; never on your public profile'],
]

export default function FuelInfoPage() {
  const router = useRouter()
  return (
    <div className="min-h-screen pb-28">
      <header className="app-header">
        <div className="max-w-md mx-auto px-4 pt-10 pb-3 flex items-end justify-between gap-3">
          <div>
            <span className="plan-label">Sheet F-01 · Method</span>
            <h1 className="text-[32px] text-brand-black leading-none">How fuel plans work</h1>
          </div>
          <button onClick={() => router.back()} className="card card-press px-3 py-1.5 font-display text-[16px] text-brand-black">Back</button>
        </div>
        <div className="dim-line max-w-md mx-auto" aria-hidden />
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-6 animate-page-in">
        <section className="card p-4 flex items-center gap-3">
          <Doodle name="shoe" size={56} className="text-brand-black flex-shrink-0" />
          <p className="text-[13px] text-brand-black">
            Your calorie target is plain arithmetic, not AI. The AI only picks meals from your hall&apos;s menu to fit it, and every number it shows comes from CU Dining&apos;s posted nutrition. Estimates for everyday eating, not medical advice.
          </p>
        </section>

        <section>
          <span className="plan-label">Sec. 01</span>
          <h2 className="text-[24px] text-brand-black leading-tight">How the numbers are made</h2>
          <div className="dim-line mt-1.5 mb-3" aria-hidden />
          <ol className="space-y-2.5">
            {METHODS.map((m) => (
              <li key={m.no} className="card px-3.5 py-3">
                <span className="plan-label !text-brand-black">{m.no} · {m.what}</span>
                <p className="text-[13px] text-brand-black mt-1 leading-snug">{m.how}</p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted mt-1.5">{m.source}</p>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[12px] text-muted">
            Meals you&apos;ve logged count as logged. A meal whose time has passed without a log counts at its usual share of the day (breakfast 25%, lunch 35%, dinner 40%), so you&apos;re not told to eat a whole day at dinner.
          </p>
        </section>

        <section>
          <span className="plan-label">Sec. 02</span>
          <h2 className="text-[24px] text-brand-black leading-tight">What the AI does</h2>
          <div className="dim-line mt-1.5 mb-3" aria-hidden />
          <ol className="space-y-2 text-[13px] text-brand-black">
            {[
              'Drafts breakfast, lunch and dinner from the hall’s menu.',
              'A checking tool adds the draft up from the menu’s nutrition data and flags anything over or under target, low on protein, off the menu, or against your diet and allergy list.',
              'The AI revises until the check passes.',
              'The server checks the final plan again and drops anything that doesn’t hold up.',
            ].map((t, i) => (
              <li key={i} className="card px-3.5 py-2.5 flex gap-3"><span className="font-mono text-[11px] pt-0.5">0{i + 1}</span><span>{t}</span></li>
            ))}
          </ol>
          <p className="mt-3 text-[12px] text-muted">
            The AI sees only sport, start time, minutes, distance, climb and calories. Never activity names, maps or GPS data.
          </p>
        </section>

        <section>
          <span className="plan-label">Sec. 03</span>
          <h2 className="text-[24px] text-brand-black leading-tight">What we keep</h2>
          <div className="dim-line mt-1.5 mb-3" aria-hidden />
          <ul className="card divide-y divide-brand-black/15">
            {KEPT.map(([what, how]) => (
              <li key={what} className="px-3.5 py-2.5 flex justify-between gap-3 text-[13px] text-brand-black">
                <span>{what}</span><span className="text-muted text-right flex-shrink-0 max-w-[45%]">{how}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-muted">
            Strava is optional and only contacted after you agree and approve it there. Manage Strava in <Link href="/profile" className="underline underline-offset-2">Profile</Link> any time. Disconnecting revokes access at Strava and deletes its data.
          </p>
        </section>
      </main>
    </div>
  )
}
