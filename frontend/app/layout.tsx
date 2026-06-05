import type { Metadata } from 'next'
import { Syne, DM_Sans } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
import NavBar from '@/components/NavBar'
import InstallPrompt from '@/components/InstallPrompt'

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

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
      <body className={`${syne.variable} ${dmSans.variable} font-sans bg-surface text-brand-black antialiased`}>
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
