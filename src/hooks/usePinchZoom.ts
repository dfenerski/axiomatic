import { useEffect, useRef, type RefObject } from 'react'

export interface PinchZoomOptions {
  onZoomChange: (scale: number) => void
  min: number
  max: number
}

const DOUBLE_TAP_MS = 300

function distance(t1: Touch, t2: Touch): number {
  const dx = t1.clientX - t2.clientX
  const dy = t1.clientY - t2.clientY
  return Math.sqrt(dx * dx + dy * dy)
}

export function usePinchZoom(ref: RefObject<HTMLElement | null>, options: PinchZoomOptions) {
  const initialDistRef = useRef(0)
  const lastTapRef = useRef(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initialDistRef.current = distance(e.touches[0], e.touches[1])
      } else if (e.touches.length === 1) {
        const now = Date.now()
        if (now - lastTapRef.current < DOUBLE_TAP_MS) {
          options.onZoomChange(1)
          lastTapRef.current = 0
        } else {
          lastTapRef.current = now
        }
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length < 2 || initialDistRef.current === 0) return
      const currentDist = distance(e.touches[0], e.touches[1])
      const rawScale = currentDist / initialDistRef.current
      const clamped = Math.min(options.max, Math.max(options.min, rawScale))
      options.onZoomChange(clamped)
    }

    el.addEventListener('touchstart', onTouchStart)
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
    }
  }, [ref, options])
}
