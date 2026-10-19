'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SparklesIcon, UsersIcon, FireIcon, UserCircleIcon, ChatIcon } from './icons'

const TABS = [
  { href: '/home',      label: 'Discover',  Icon: SparklesIcon },
  { href: '/social',    label: 'Tables',    Icon: ChatIcon },
  { href: '/community', label: 'Feed',      Icon: UsersIcon },
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
        <div className="max-w-md mx-auto flex h-[60px] card shadow-soft-lg p-1.5 gap-1.5">
          {TABS.map(({ href, label, Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 flex items-stretch card-press"
                aria-label={label}
                aria-current={active ? 'page' : undefined}
              >
                <span className={`flex w-full flex-col items-center gap-1 py-1.5 transition-colors duration-200 ${
                  active ? 'bg-brand-black text-white' : 'text-brand-black'
                }`}>
                  <Icon width={21} height={21} />
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] leading-none">{label}</span>
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
