import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSwipe } from '../useSwipe'
import { useRef } from 'react'

function createTouchEvent(type: string, clientX: number, clientY: number): TouchEvent {
  const touch = { clientX, clientY, identifier: 0, target: document.body } as unknown as Touch
  return new TouchEvent(type, {
    touches: type === 'touchend' ? [] : [touch],
    changedTouches: [touch],
    bubbles: true,
  })
}

describe('useSwipe', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('fires onSwipeLeft when deltaX < -threshold', () => {
    const onSwipeLeft = vi.fn()
    renderHook(() => {
      const ref = useRef(container)
      useSwipe(ref, { onSwipeLeft })
    })

    container.dispatchEvent(createTouchEvent('touchstart', 200, 100))
    container.dispatchEvent(createTouchEvent('touchend', 50, 105))

    expect(onSwipeLeft).toHaveBeenCalledOnce()
  })

  it('fires onSwipeRight when deltaX > threshold', () => {
    const onSwipeRight = vi.fn()
    renderHook(() => {
      const ref = useRef(container)
      useSwipe(ref, { onSwipeRight })
    })

    container.dispatchEvent(createTouchEvent('touchstart', 50, 100))
    container.dispatchEvent(createTouchEvent('touchend', 200, 105))

    expect(onSwipeRight).toHaveBeenCalledOnce()
  })

  it('does not fire on vertical swipe', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    renderHook(() => {
      const ref = useRef(container)
      useSwipe(ref, { onSwipeLeft, onSwipeRight })
    })

    container.dispatchEvent(createTouchEvent('touchstart', 100, 50))
    container.dispatchEvent(createTouchEvent('touchend', 105, 250))

    expect(onSwipeLeft).not.toHaveBeenCalled()
    expect(onSwipeRight).not.toHaveBeenCalled()
  })

  it('does not fire on short swipe below 30px threshold', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    renderHook(() => {
      const ref = useRef(container)
      useSwipe(ref, { onSwipeLeft, onSwipeRight })
    })

    container.dispatchEvent(createTouchEvent('touchstart', 100, 100))
    container.dispatchEvent(createTouchEvent('touchend', 85, 105))

    expect(onSwipeLeft).not.toHaveBeenCalled()
    expect(onSwipeRight).not.toHaveBeenCalled()
  })

  it('fires onTap on minimal movement', () => {
    const onTap = vi.fn()
    renderHook(() => {
      const ref = useRef(container)
      useSwipe(ref, { onTap })
    })

    container.dispatchEvent(createTouchEvent('touchstart', 100, 100))
    container.dispatchEvent(createTouchEvent('touchend', 103, 102))

    expect(onTap).toHaveBeenCalledOnce()
  })
})
