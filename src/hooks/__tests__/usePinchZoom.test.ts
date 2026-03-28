import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePinchZoom } from '../usePinchZoom'
import { useRef } from 'react'

function createTouchEvent(type: string, touches: Array<{ clientX: number; clientY: number }>): TouchEvent {
  const touchObjs = touches.map((t, i) => ({ ...t, identifier: i, target: document.body }) as unknown as Touch)
  return new TouchEvent(type, {
    touches: type === 'touchend' ? [] : touchObjs,
    changedTouches: touchObjs,
    bubbles: true,
    cancelable: true,
  })
}

describe('usePinchZoom', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('calls onZoomChange with scale > 1 on pinch spread', () => {
    const onZoomChange = vi.fn()
    renderHook(() => {
      const ref = useRef(container)
      usePinchZoom(ref, { onZoomChange, min: 0.5, max: 3 })
    })

    // Start with fingers 100px apart
    container.dispatchEvent(createTouchEvent('touchstart', [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 100 },
    ]))

    // Move to 200px apart (scale = 2)
    container.dispatchEvent(createTouchEvent('touchmove', [
      { clientX: 50, clientY: 100 },
      { clientX: 250, clientY: 100 },
    ]))

    expect(onZoomChange).toHaveBeenCalled()
    const lastScale = onZoomChange.mock.calls[onZoomChange.mock.calls.length - 1][0]
    expect(lastScale).toBeGreaterThan(1)
  })

  it('calls onZoomChange with scale < 1 on pinch squeeze', () => {
    const onZoomChange = vi.fn()
    renderHook(() => {
      const ref = useRef(container)
      usePinchZoom(ref, { onZoomChange, min: 0.5, max: 3 })
    })

    // Start with fingers 200px apart
    container.dispatchEvent(createTouchEvent('touchstart', [
      { clientX: 50, clientY: 100 },
      { clientX: 250, clientY: 100 },
    ]))

    // Move to 100px apart (scale = 0.5)
    container.dispatchEvent(createTouchEvent('touchmove', [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 100 },
    ]))

    expect(onZoomChange).toHaveBeenCalled()
    const lastScale = onZoomChange.mock.calls[onZoomChange.mock.calls.length - 1][0]
    expect(lastScale).toBeLessThan(1)
  })

  it('does not trigger zoom on single finger', () => {
    const onZoomChange = vi.fn()
    renderHook(() => {
      const ref = useRef(container)
      usePinchZoom(ref, { onZoomChange, min: 0.5, max: 3 })
    })

    container.dispatchEvent(createTouchEvent('touchstart', [
      { clientX: 100, clientY: 100 },
    ]))

    container.dispatchEvent(createTouchEvent('touchmove', [
      { clientX: 200, clientY: 100 },
    ]))

    expect(onZoomChange).not.toHaveBeenCalled()
  })

  it('clamps zoom to min/max bounds', () => {
    const onZoomChange = vi.fn()
    renderHook(() => {
      const ref = useRef(container)
      usePinchZoom(ref, { onZoomChange, min: 0.5, max: 2 })
    })

    // Start with fingers 100px apart
    container.dispatchEvent(createTouchEvent('touchstart', [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 100 },
    ]))

    // Move to 500px apart (scale = 5, should clamp to max=2)
    container.dispatchEvent(createTouchEvent('touchmove', [
      { clientX: 0, clientY: 100 },
      { clientX: 500, clientY: 100 },
    ]))

    expect(onZoomChange).toHaveBeenCalled()
    const lastScale = onZoomChange.mock.calls[onZoomChange.mock.calls.length - 1][0]
    expect(lastScale).toBeLessThanOrEqual(2)
  })

  it('resets zoom on double-tap', () => {
    const onZoomChange = vi.fn()
    renderHook(() => {
      const ref = useRef(container)
      usePinchZoom(ref, { onZoomChange, min: 0.5, max: 3 })
    })

    // First tap
    container.dispatchEvent(createTouchEvent('touchstart', [
      { clientX: 100, clientY: 100 },
    ]))
    container.dispatchEvent(createTouchEvent('touchend', [
      { clientX: 100, clientY: 100 },
    ]))

    // Second tap quickly (double-tap)
    container.dispatchEvent(createTouchEvent('touchstart', [
      { clientX: 100, clientY: 100 },
    ]))
    container.dispatchEvent(createTouchEvent('touchend', [
      { clientX: 100, clientY: 100 },
    ]))

    expect(onZoomChange).toHaveBeenCalledWith(1)
  })
})
