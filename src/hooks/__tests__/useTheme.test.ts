import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { resetMockInvoke } from '../../../__mocks__/@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core')
vi.mock('@tauri-apps/api/window')

const STORAGE_KEY = 'axiomatic:theme'

beforeEach(() => {
  resetMockInvoke()
  localStorage.clear()
})

// Import after mocks are set up (module has side effects)
import { useTheme, setTheme } from '../useTheme'

describe('useTheme', () => {
  it('returns system theme when localStorage is empty', () => {
    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('system')
    // resolved depends on matchMedia/osTheme detection, just check it is valid
    expect(['light', 'dark']).toContain(result.current.resolved)
  })

  it('returns light when localStorage is set to light', () => {
    localStorage.setItem(STORAGE_KEY, 'light')

    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('light')
    expect(result.current.resolved).toBe('light')
  })

  it('returns dark when localStorage is set to dark', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')

    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('dark')
    expect(result.current.resolved).toBe('dark')
  })

  it('setTheme updates theme and localStorage', () => {
    const { result } = renderHook(() => useTheme())

    act(() => {
      setTheme('dark')
    })

    expect(result.current.theme).toBe('dark')
    expect(result.current.resolved).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
  })

  it('setTheme to system removes localStorage key', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')

    const { result } = renderHook(() => useTheme())

    act(() => {
      setTheme('system')
    })

    expect(result.current.theme).toBe('system')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('cycle rotates through system -> light -> dark -> system', () => {
    const { result } = renderHook(() => useTheme())

    // Start at system (no localStorage)
    expect(result.current.theme).toBe('system')

    act(() => {
      result.current.cycle()
    })
    expect(result.current.theme).toBe('light')

    act(() => {
      result.current.cycle()
    })
    expect(result.current.theme).toBe('dark')

    act(() => {
      result.current.cycle()
    })
    expect(result.current.theme).toBe('system')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
