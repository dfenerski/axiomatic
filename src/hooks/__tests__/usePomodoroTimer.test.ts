import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}))

import { usePomodoroTimer, toggleTimer, resetTimer } from '../usePomodoroTimer'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  act(() => { resetTimer() })
})

afterEach(() => {
  act(() => { resetTimer() })
  vi.useRealTimers()
})

describe('usePomodoroTimer', () => {
  it('timer ticks while a subscriber is mounted', () => {
    const { result } = renderHook(() => usePomodoroTimer())
    const initial = result.current.secondsLeft

    act(() => { toggleTimer() })
    expect(result.current.running).toBe(true)

    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current.secondsLeft).toBe(initial - 3)
  })

  it('interval pauses when all subscribers unmount and resumes on remount', () => {
    const { result, unmount } = renderHook(() => usePomodoroTimer())
    const initial = result.current.secondsLeft

    act(() => { toggleTimer() })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current.secondsLeft).toBe(initial - 2)

    // Unmount — interval should pause
    unmount()
    vi.advanceTimersByTime(5000)

    // Remount — should resume from where it paused
    const { result: result2 } = renderHook(() => usePomodoroTimer())
    expect(result2.current.secondsLeft).toBe(initial - 2) // not initial - 7
    expect(result2.current.running).toBe(true)

    // Timer should be ticking again
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result2.current.secondsLeft).toBe(initial - 3)
  })
})
