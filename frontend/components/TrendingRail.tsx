'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getTrends, getWeeklyTrends } from '@/services/communityService'
import TrendingPost from './TrendingPost'
import type { CommunityCombo } from '@/types'

interface Props {
  onOpen: (combo: CommunityCombo) => void
}

/** "Trending on campus" — horizontal rail of students' top-voted combos for Discover. */
export default function TrendingRail({ onOpen }: Props) {
  const [combos, setCombos] = useState<CommunityCombo[] | null>(null)
  const [weekly, setWeekly] = useState(false)

  useEffect(() => {
    let cancelled = false
    getTrends()
      .then(async (today) => {
        // Early mornings the daily board is empty — fall back to this week's hits.
        if (today.length > 0) return today
        const week = await getWeeklyTrends()
        if (!cancelled) setWeekly(true)
        return week
      })
      .then((list) => { if (!cancelled) setCombos(list.slice(0, 8)) })
      .catch(() => { if (!cancelled) setCombos([]) })
    return () => { cancelled = true }
  }, [])

  if (combos !== null && combos.length === 0) return null

  return (
    <section className="mb-6" aria-labelledby="trending-rail-heading">
      <div className="mb-3">
        <div className="flex items-end justify-between gap-2">
          <div>
            <span className="plan-label">Sec. 01</span>
            <h2 id="trending-rail-heading" className="text-[24px] text-brand-black leading-tight">
              Trending {weekly ? 'this week' : 'on campus'}
            </h2>
          </div>
          <Link href="/trends" className="font-display text-[16px] text-brand-black underline underline-offset-4">
            See all
          </Link>
        </div>
        <div className="dim-line mt-1.5" aria-hidden />
      </div>
      <div className="-mx-4 px-4 pt-1 pb-3 overflow-x-auto scrollbar-hide">
        <div className="flex gap-3 w-max">
          {combos === null
            ? [0, 1, 2].map((i) => <div key={i} className="w-[150px] h-[190px] shimmer rounded-3xl" />)
            : combos.map((c, i) => (
                <div key={c.id} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }}>
                  <TrendingPost combo={c} rank={i + 1} variant="compact" onClick={() => onOpen(c)} />
                </div>
              ))}
        </div>
      </div>
    </section>
  )
}
