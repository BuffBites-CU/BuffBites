import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Plus_Jakarta_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
import NavBar from '@/components/NavBar'
import InstallPrompt from '@/components/InstallPrompt'

// A friendly grotesque for headings and big numbers…
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['600', '700', '800'],
  display: 'swap',
})

// …a clean sans for body text…
const bodySans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

// …and a mono for numbers and times.
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
  display: 'swap',
})

export const viewport: Viewport = {
  themeColor: '#F7F6F3',
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
      <body className={`${display.variable} ${bodySans.variable} ${plexMono.variable} font-sans bg-surface text-brand-black antialiased`}>
        <div aria-hidden className="status-shield" />
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
