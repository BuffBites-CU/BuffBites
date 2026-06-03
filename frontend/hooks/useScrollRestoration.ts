import { useEffect } from 'react'

export function useScrollRestoration(key: string) {
  useEffect(() => {
    const saved = sessionStorage.getItem(`scroll:${key}`)
    if (saved) {
      const y = parseInt(saved, 10)
      if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y))
    }

    return () => {
      sessionStorage.setItem(`scroll:${key}`, String(window.scrollY))
    }
  }, [key])
}
