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
      {/* Thin gold gradient top border */}
      <div className="h-px bg-gradient-to-r from-transparent via-brand-gold/50 to-transparent" />

      <div
        className="bg-surface-card/95 backdrop-blur-xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-md mx-auto flex h-[60px]">
          {TABS.map(({ href, label, Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-opacity active:opacity-60"
                aria-label={label}
                aria-current={active ? 'page' : undefined}
              >
                {/* Active dot */}
                <span
                  className={`block rounded-full bg-brand-gold transition-all duration-300 mb-0.5 ${
                    active ? 'w-1 h-1 opacity-100 animate-dot-pop' : 'w-0 h-0 opacity-0'
                  }`}
                />

                <Icon
                  className={`transition-all duration-200 ${
                    active ? 'text-brand-gold' : 'text-muted'
                  }`}
                  width={21}
                  height={21}
                />

                <span
                  className={`font-display text-[9px] font-semibold tracking-widest uppercase transition-all duration-200 ${
                    active ? 'text-brand-gold' : 'text-muted'
                  }`}
                >
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
