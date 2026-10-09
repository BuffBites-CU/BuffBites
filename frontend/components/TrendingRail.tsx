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
    <section className="mb-5" aria-labelledby="trending-rail-heading">
      <div className="flex items-baseline justify-between mb-2">
        <h2 id="trending-rail-heading" className="font-brush text-2xl text-brand-black leading-none">
          Trending {weekly ? 'this week' : 'on campus'} <span aria-hidden>🔥</span>
        </h2>
        <Link href="/trends" className="text-xs font-semibold text-brand-deep">
          See all
        </Link>
      </div>
      <div className="-mx-4 px-4 pt-3 pb-2 overflow-x-auto scrollbar-hide">
        <div className="flex gap-3 w-max">
          {combos === null
            ? [0, 1, 2].map((i) => <div key={i} className="w-[220px] h-[168px] shimmer rounded-2xl" />)
            : combos.map((c, i) => (
                <TrendingPost key={c.id} combo={c} rank={i + 1} variant="compact" onClick={() => onOpen(c)} />
              ))}
        </div>
      </div>
    </section>
  )
}
