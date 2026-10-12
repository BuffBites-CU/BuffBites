import type { Metadata, Viewport } from 'next'
import { Architects_Daughter, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
import NavBar from '@/components/NavBar'
import InstallPrompt from '@/components/InstallPrompt'

// Architect's hand lettering for headings, labels and buttons…
const hand = Architects_Daughter({
  subsets: ['latin'],
  variable: '--font-hand',
  weight: '400',
  display: 'swap',
})

// …a technical sans for body text…
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

// …and a mono for drawing annotations (SHEET A-01, ROOM: C4C).
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
  display: 'swap',
})

export const viewport: Viewport = {
  themeColor: '#FFFFFF',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'BuffBites',
  description: 'AI-powered dining combo discovery for CU Boulder',
  manifest: '/manifest.json',
  icons: {
    icon:      '/logoi.jpeg',
    apple:     '/logoi.jpeg',
    shortcut:  '/logoi.jpeg',
  },
  appleWebApp: {
    capable: true,
    title: 'BuffBites',
    statusBarStyle: 'black-translucent',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${hand.variable} ${plexSans.variable} ${plexMono.variable} font-sans bg-surface text-brand-black antialiased`}>
        <AuthProvider>
          <ToastProvider>
            <main className="min-h-screen">{children}</main>
            <NavBar />
            <InstallPrompt />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
