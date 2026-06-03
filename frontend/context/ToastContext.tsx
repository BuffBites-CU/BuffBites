'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'

type ToastVariant = 'success' | 'error' | 'neutral'

interface ToastMessage {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const counterRef = useRef(0)

  const showToast = useCallback((message: string, variant: ToastVariant = 'neutral') => {
    const id = ++counterRef.current
    setToasts((prev) => [...prev, { id, message, variant }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  const variantStyle: Record<ToastVariant, string> = {
    success: 'bg-brand-black text-white',
    error: 'bg-red-600 text-white',
    neutral: 'bg-brand-black text-white',
  }

  const variantIcon: Record<ToastVariant, string> = {
    success: '✓',
    error: '✕',
    neutral: '',
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-medium shadow-lg animate-toast-in ${variantStyle[t.variant]}`}
          >
            {variantIcon[t.variant] && (
              <span className="text-xs font-bold">{variantIcon[t.variant]}</span>
            )}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
