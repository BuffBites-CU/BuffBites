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
      {/* Floating white bar on the peach page */}
      <div className="px-3" style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
        <div className="max-w-md mx-auto flex h-[62px] card shadow-soft-lg px-1.5">
          {TABS.map(({ href, label, Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 flex items-center justify-center card-press"
                aria-label={label}
                aria-current={active ? 'page' : undefined}
              >
                <span className={`flex flex-col items-center gap-0.5 transition-colors duration-200 ${active ? 'text-brand-deep' : 'text-muted'}`}>
                  <Icon width={22} height={22} />
                  <span className="font-display text-[13px] leading-none">{label}</span>
                  <span className={`h-1 w-1 rounded-full bg-brand transition-opacity ${active ? 'opacity-100 animate-dot-pop' : 'opacity-0'}`} />
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
