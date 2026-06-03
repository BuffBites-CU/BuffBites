import { useCallback, useEffect, useRef } from 'react'

const THRESHOLD = 64

export function usePullToRefresh(onRefresh: () => void) {
  const startY = useRef(0)
  const pulling = useRef(false)
  const stableRefresh = useRef(onRefresh)
  stableRefresh.current = onRefresh

  const handleRefresh = useCallback(() => stableRefresh.current(), [])

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY === 0) {
        startY.current = e.touches[0].clientY
        pulling.current = true
      }
    }

    function onTouchMove() {
      if (!pulling.current) return
    }

    function onTouchEnd(e: TouchEvent) {
      if (!pulling.current) return
      pulling.current = false
      const dy = e.changedTouches[0].clientY - startY.current
      if (dy > THRESHOLD) handleRefresh()
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [handleRefresh])
}
