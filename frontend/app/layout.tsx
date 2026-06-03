import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
import NavBar from '@/components/NavBar'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'BuffBites',
  description: 'AI-powered dining hall combo discovery for CU Boulder',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans bg-surface text-brand-black antialiased`}>
        <AuthProvider>
          <ToastProvider>
            <main className="min-h-screen">{children}</main>
            <NavBar />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
