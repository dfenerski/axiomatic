import { useEffect, type RefObject } from 'react'

export interface SwipeHandlers {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onTap?: () => void
  threshold?: number
}

const DEFAULT_THRESHOLD = 30
const TAP_THRESHOLD = 10

export function useSwipe(ref: RefObject<HTMLElement | null>, handlers: SwipeHandlers) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    let startX = 0
    let startY = 0
    let inScrollable = false

    /** Check if touch started inside a scrollable container */
    function isInsideScrollable(target: EventTarget | null): boolean {
      let node = target as HTMLElement | null
      while (node && node !== el) {
        const { overflowX, overflowY, overflow } = getComputedStyle(node)
        const scrollable = [overflow, overflowX, overflowY].some(
          (v) => v === 'auto' || v === 'scroll',
        )
        if (scrollable && (node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight)) {
          return true
        }
        node = node.parentElement
      }
      return false
    }

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (!touch) return
      startX = touch.clientX
      startY = touch.clientY
      inScrollable = isInsideScrollable(e.target)
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (inScrollable) return

      const touch = e.changedTouches[0]
      if (!touch) return
      const deltaX = touch.clientX - startX
      const deltaY = touch.clientY - startY
      const absDeltaX = Math.abs(deltaX)
      const absDeltaY = Math.abs(deltaY)
      const threshold = handlers.threshold ?? DEFAULT_THRESHOLD

      if (absDeltaX < TAP_THRESHOLD && absDeltaY < TAP_THRESHOLD) {
        handlers.onTap?.()
        return
      }

      if (absDeltaX > threshold && absDeltaX > absDeltaY) {
        if (deltaX < 0) {
          handlers.onSwipeLeft?.()
        } else {
          handlers.onSwipeRight?.()
        }
      }
    }

    el.addEventListener('touchstart', onTouchStart)
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [ref, handlers])
}
