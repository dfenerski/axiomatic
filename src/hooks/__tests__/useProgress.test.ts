import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { mockInvoke, resetMockInvoke, getInvokeCallsFor } from '../../__mocks__/@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core')

import { useProgress } from '../useProgress'

beforeEach(() => {
  resetMockInvoke()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useProgress', () => {
  it('loads progress from multiple directories and aggregates results', async () => {
    mockInvoke('get_all_progress', (args?: Record<string, unknown>) => {
      const dirPath = args?.dirPath as string
      if (dirPath === '/dir1') {
        return { book_a: { currentPage: 5, totalPages: 100, lastReadAt: '2024-01-01' } }
      }
      if (dirPath === '/dir2') {
        return { book_b: { currentPage: 10, totalPages: 200, lastReadAt: '2024-01-02' } }
      }
      return {}
    })

    const { result } = renderHook(() => useProgress(['/dir1', '/dir2']))

    await waitFor(() => {
      expect(Object.keys(result.current.progress).length).toBe(2)
    })

    expect(result.current.progress['book_a']).toEqual({
      currentPage: 5,
      totalPages: 100,
      lastReadAt: '2024-01-01',
    })
    expect(result.current.progress['book_b']).toEqual({
      currentPage: 10,
      totalPages: 200,
      lastReadAt: '2024-01-02',
    })
  })

  it('debounces save_progress calls at 300ms', async () => {
    mockInvoke('get_all_progress', {})

    const { result } = renderHook(() => useProgress(['/mydir']))

    await waitFor(() => {
      expect(result.current.progress).toBeDefined()
    })

    // Trigger multiple rapid updates
    act(() => {
      result.current.update('/mydir', 'book_x', { currentPage: 2 })
    })
    act(() => {
      result.current.update('/mydir', 'book_x', { currentPage: 3 })
    })
    act(() => {
      result.current.update('/mydir', 'book_x', { currentPage: 4 })
    })

    // Before debounce fires, no save_progress calls
    const callsBefore = getInvokeCallsFor('save_progress')
    expect(callsBefore.length).toBe(0)

    // Advance past debounce timer
    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    // Should have exactly one debounced save_progress call
    const callsAfter = getInvokeCallsFor('save_progress')
    expect(callsAfter.length).toBe(1)
    expect(callsAfter[0].args?.slug).toBe('book_x')
    // The progress should reflect the latest update (page 4)
    const savedProgress = callsAfter[0].args?.progress as { currentPage: number }
    expect(savedProgress.currentPage).toBe(4)
  })

  it('optimistically updates local state before debounce fires', () => {
    mockInvoke('get_all_progress', {})

    const { result } = renderHook(() => useProgress(['/mydir']))

    act(() => {
      result.current.update('/mydir', 'book_z', { currentPage: 7, totalPages: 50 })
    })

    // State is updated immediately (no wait for debounce)
    expect(result.current.progress['book_z']?.currentPage).toBe(7)
    expect(result.current.progress['book_z']?.totalPages).toBe(50)
  })

  it('returns empty progress when no dirPaths are provided', () => {
    const { result } = renderHook(() => useProgress([]))
    expect(result.current.progress).toEqual({})
  })
})
