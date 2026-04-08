import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBatchedRender } from '../useBatchedRender'

// Collect rAF callbacks so we can flush them manually
let rafCallbacks: Array<() => void> = []
let originalRAF: typeof requestAnimationFrame
let originalCancelRAF: typeof cancelAnimationFrame

beforeEach(() => {
  rafCallbacks = []
  originalRAF = globalThis.requestAnimationFrame
  originalCancelRAF = globalThis.cancelAnimationFrame

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = rafCallbacks.length + 1
    rafCallbacks.push(() => cb(performance.now()))
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  globalThis.requestAnimationFrame = originalRAF
  globalThis.cancelAnimationFrame = originalCancelRAF
})

function flushRAF() {
  const pending = [...rafCallbacks]
  rafCallbacks = []
  for (const cb of pending) cb()
}

describe('useBatchedRender', () => {
  it('returns batch size when total exceeds it', () => {
    const { result } = renderHook(() => useBatchedRender(100))

    // Initial batch is min(20, 100) = 20
    expect(result.current).toBe(20)
  })

  it('returns total when total is less than batch size', () => {
    const { result } = renderHook(() => useBatchedRender(5))

    // min(20, 5) = 5 — no batching needed
    expect(result.current).toBe(5)
  })

  it('increases count after requestAnimationFrame flushes', () => {
    const { result } = renderHook(() => useBatchedRender(60))

    expect(result.current).toBe(20)

    // First rAF: 20 + 20 = 40
    act(() => flushRAF())
    expect(result.current).toBe(40)

    // Second rAF: 40 + 20 = 60
    act(() => flushRAF())
    expect(result.current).toBe(60)

    // No more rAF scheduled since count >= total
    const callbacksBefore = rafCallbacks.length
    act(() => flushRAF())
    expect(result.current).toBe(60)
    expect(rafCallbacks.length).toBe(callbacksBefore)
  })

  it('caps at total and does not overshoot', () => {
    const { result } = renderHook(() => useBatchedRender(30))

    expect(result.current).toBe(20)

    // One rAF: min(20 + 20, 30) = 30
    act(() => flushRAF())
    expect(result.current).toBe(30)
  })
})
