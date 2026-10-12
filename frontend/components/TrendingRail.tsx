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
      <div className="flex items-baseline justify-between mb-3">
        <h2 id="trending-rail-heading" className="text-[24px] text-brand-black leading-none">
          Trending {weekly ? 'this week' : 'on campus'}
        </h2>
        <Link href="/trends" className="font-display text-[17px] text-brand-deep">
          See all
        </Link>
      </div>
      <div className="-mx-4 px-4 pb-3 overflow-x-auto scrollbar-hide">
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
