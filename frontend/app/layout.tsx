import type { Metadata, Viewport } from 'next'
import { Patrick_Hand, Outfit } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
import NavBar from '@/components/NavBar'
import InstallPrompt from '@/components/InstallPrompt'

// Hand-drawn display face for headings, buttons and labels…
const hand = Patrick_Hand({
  subsets: ['latin'],
  variable: '--font-hand',
  weight: '400',
  display: 'swap',
})

// …and a soft, rounded sans for body text.
const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

export const viewport: Viewport = {
  themeColor: '#FFF3ED',
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
      <body className={`${hand.variable} ${outfit.variable} font-sans bg-surface text-brand-black antialiased`}>
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
