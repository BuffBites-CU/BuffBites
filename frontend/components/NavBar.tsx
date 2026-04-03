// components/NavBar.tsx
// "use client"
// Fixed bottom tab bar — present on all authenticated pages.
//
// TABS (left to right):
//   1. Discover   — icon: sparkles or lightning bolt  → /home
//   2. Community  — icon: users or speech bubble      → /community
//   3. Trends     — icon: fire or trending arrow      → /trends
//   4. Profile    — icon: user circle                 → /profile
//
// ACTIVE STATE
//   Use usePathname() from next/navigation to detect the current route.
//   Active tab: icon + label in brand-gold, slightly larger
//   Inactive tab: icon + label in muted gray
//
// LAYOUT
//   Fixed to bottom of viewport (fixed bottom-0 left-0 right-0)
//   White background with a subtle top border (border-t border-gray-200)
//   Safe area padding at bottom for iOS home indicator: pb-safe (or pb-5)
//   Height: ~64px
//   4 equal-width columns, each a Next.js <Link> wrapping icon + label
//
// Do NOT render NavBar on the "/" (sign-in) or "/onboarding" routes.
// Check pathname in layout.tsx and conditionally include NavBar.
