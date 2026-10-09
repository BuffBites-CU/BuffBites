'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SparklesIcon, UsersIcon, FireIcon, UserCircleIcon } from './icons'

const TABS = [
  { href: '/home',      label: 'Discover',  Icon: SparklesIcon },
  { href: '/community', label: 'Community', Icon: UsersIcon },
  { href: '/trends',    label: 'Trends',    Icon: FireIcon },
  { href: '/profile',   label: 'Profile',   Icon: UserCircleIcon },
] as const

const HIDDEN_ROUTES = ['/', '/onboarding']

export default function NavBar() {
  const pathname = usePathname()

  if (HIDDEN_ROUTES.includes(pathname)) return null

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40"
      role="navigation"
      aria-label="Main navigation"
    >
      <div
        className="bg-brand-black border-t-2 border-brand-black"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-md mx-auto flex h-[64px] px-2 gap-1">
          {TABS.map(({ href, label, Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 flex items-center justify-center transition-opacity active:opacity-70"
                aria-label={label}
                aria-current={active ? 'page' : undefined}
              >
                <span
                  className={`flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 transition-colors duration-200 ${
                    active ? 'bg-brand text-brand-black' : 'text-surface-warm/80'
                  }`}
                >
                  <Icon width={21} height={21} />
                  <span className="font-display text-[10px] font-bold tracking-wide">{label}</span>
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
