'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SparklesIcon, UsersIcon, FireIcon, UserCircleIcon } from './icons'

const TABS = [
  { href: '/home', label: 'Discover', Icon: SparklesIcon },
  { href: '/community', label: 'Community', Icon: UsersIcon },
  { href: '/trends', label: 'Trends', Icon: FireIcon },
  { href: '/profile', label: 'Profile', Icon: UserCircleIcon },
] as const

const HIDDEN_ROUTES = ['/', '/onboarding']

export default function NavBar() {
  const pathname = usePathname()

  if (HIDDEN_ROUTES.includes(pathname)) return null

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-16">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex items-center justify-center transition-colors"
              aria-label={label}
              aria-current={active ? 'page' : undefined}
            >
              <div className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all ${
                active ? 'bg-brand-gold/15' : ''
              }`}>
                <Icon
                  className={active ? 'text-brand-gold' : 'text-muted'}
                  width={22}
                  height={22}
                />
                <span className={`text-[10px] font-medium tracking-wide ${
                  active ? 'text-brand-gold' : 'text-muted'
                }`}>
                  {label}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
