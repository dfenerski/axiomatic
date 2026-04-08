import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// No IPC mock needed -- this hook uses localStorage only

beforeEach(() => {
  localStorage.clear()
  // Reset modules to clear the module-level store snapshot
  vi.resetModules()
})

async function importFresh() {
  return await import('../usePomodoroConfig')
}

describe('usePomodoroConfig', () => {
  it('returns default config when localStorage is empty', async () => {
    const { usePomodoroConfig } = await importFresh()
    const { result } = renderHook(() => usePomodoroConfig())

    expect(result.current).toEqual({
      preset: '45/10',
      workMinutes: 45,
      breakMinutes: 10,
      audioEnabled: true,
      longBreakMultiplier: 3,
      longBreakInterval: 4,
    })
  })

  it('savePomodoroConfig persists to localStorage and updates hook state', async () => {
    const { usePomodoroConfig, savePomodoroConfig } = await importFresh()
    const { result } = renderHook(() => usePomodoroConfig())

    const updated = {
      preset: '60/10' as const,
      workMinutes: 60,
      breakMinutes: 10,
      audioEnabled: false,
      longBreakMultiplier: 2,
      longBreakInterval: 3,
    }

    act(() => {
      savePomodoroConfig(updated)
    })

    expect(result.current).toEqual(updated)

    // Verify localStorage was written
    const stored = JSON.parse(localStorage.getItem('axiomatic:pomodoro-config')!)
    expect(stored.preset).toBe('60/10')
    expect(stored.workMinutes).toBe(60)
  })

  it('applyPreset updates work/break minutes for known presets', async () => {
    const { applyPreset } = await importFresh()

    const base = {
      preset: '45/10' as const,
      workMinutes: 45,
      breakMinutes: 10,
      audioEnabled: true,
      longBreakMultiplier: 3,
      longBreakInterval: 4,
    }

    const result60 = applyPreset('60/10', base)
    expect(result60.workMinutes).toBe(60)
    expect(result60.breakMinutes).toBe(10)
    expect(result60.preset).toBe('60/10')

    const result90 = applyPreset('90/15', base)
    expect(result90.workMinutes).toBe(90)
    expect(result90.breakMinutes).toBe(15)
    expect(result90.preset).toBe('90/15')

    // Custom preserves existing minutes
    const resultCustom = applyPreset('custom', base)
    expect(resultCustom.workMinutes).toBe(45)
    expect(resultCustom.breakMinutes).toBe(10)
    expect(resultCustom.preset).toBe('custom')
  })

  it('loads config from localStorage when pre-populated', async () => {
    localStorage.setItem(
      'axiomatic:pomodoro-config',
      JSON.stringify({
        preset: '90/15',
        workMinutes: 90,
        breakMinutes: 15,
        audioEnabled: false,
        longBreakMultiplier: 2,
        longBreakInterval: 6,
      }),
    )

    const { usePomodoroConfig } = await importFresh()
    const { result } = renderHook(() => usePomodoroConfig())

    expect(result.current.preset).toBe('90/15')
    expect(result.current.workMinutes).toBe(90)
    expect(result.current.breakMinutes).toBe(15)
    expect(result.current.audioEnabled).toBe(false)
  })
})
