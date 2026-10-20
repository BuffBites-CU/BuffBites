'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { ChevronLeftIcon } from './icons'

export const LEGAL_UPDATED = 'October 20, 2026'

/** Where people reach the team. Set NEXT_PUBLIC_CONTACT_EMAIL to show an inbox. */
export function Contact() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL
  return email ? (
    <a href={`mailto:${email}`} className="font-semibold underline underline-offset-2">{email}</a>
  ) : (
    <a href="https://github.com/BuffBites-CU/BuffBites/issues" className="font-semibold underline underline-offset-2">
      the BuffBites GitHub page
    </a>
  )
}

/** A readable long-form page: back button, title, date, then numbered sections. */
export default function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  const router = useRouter()
  return (
    <div className="min-h-screen pb-16">
      <header className="app-header">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button
            onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
            aria-label="Back"
            className="w-10 h-10 -ml-2 flex items-center justify-center rounded-full text-brand-black hover:bg-surface-overlay"
          >
            <ChevronLeftIcon width={22} height={22} />
          </button>
          <span className="font-display text-[18px] text-brand-black">Buff Bites</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-6 animate-page-in">
        <h1 className="text-[34px] leading-tight text-brand-black">{title}</h1>
        <p className="mt-1 text-[13px] text-muted">Last updated {LEGAL_UPDATED}</p>
        <div className="mt-4 text-[15px] leading-relaxed text-brand-black">{intro}</div>
        <div className="legal mt-6 space-y-7">{children}</div>
        <p className="mt-10 text-[13px] text-muted">
          See also our{' '}
          {title === 'Privacy Policy'
            ? <Link href="/terms" className="underline underline-offset-2">Terms of Service</Link>
            : <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>}.
        </p>
      </main>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[21px] leading-snug text-brand-black">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-brand-black/90">{children}</div>
    </section>
  )
}
