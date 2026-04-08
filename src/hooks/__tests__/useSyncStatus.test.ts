import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSyncStatus } from '../useSyncStatus'

describe('useSyncStatus', () => {
  it('returns scanning phase when loading is true', () => {
    const { result } = renderHook(() => useSyncStatus(true, 0, 0))

    expect(result.current.phase).toBe('scanning')
    expect(result.current.label).toBe('Scanning\u2026')
    expect(result.current.bookCount).toBe(0)
  })

  it('returns rendering phase when renderLimit < totalItems', () => {
    const { result } = renderHook(() => useSyncStatus(false, 50, 20))

    expect(result.current.phase).toBe('rendering')
    expect(result.current.label).toBe('50 books')
    expect(result.current.bookCount).toBe(50)
  })

  it('returns done phase when renderLimit >= totalItems', () => {
    const { result } = renderHook(() => useSyncStatus(false, 12, 20))

    expect(result.current.phase).toBe('done')
    expect(result.current.label).toBe('12 books')
    expect(result.current.bookCount).toBe(12)
  })

  it('uses singular "book" when totalItems is 1', () => {
    const { result } = renderHook(() => useSyncStatus(false, 1, 20))

    expect(result.current.phase).toBe('done')
    expect(result.current.label).toBe('1 book')
    expect(result.current.bookCount).toBe(1)
  })

  it('loading takes priority over renderLimit check', () => {
    // Even though renderLimit < totalItems, loading=true wins
    const { result } = renderHook(() => useSyncStatus(true, 50, 20))

    expect(result.current.phase).toBe('scanning')
    expect(result.current.label).toBe('Scanning\u2026')
  })
})
