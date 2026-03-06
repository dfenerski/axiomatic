import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { mockInvoke, mockInvokeError, resetMockInvoke, getInvokeCallsFor } from '../../__mocks__/@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core')

import { useStarred } from '../useStarred'
import type { Textbook } from '../useTextbooks'

const makeTextbook = (slug: string, dirPath: string): Textbook => ({
  slug,
  title: slug,
  file: `${slug}.pdf`,
  dir_id: 1,
  dir_path: dirPath,
  full_path: `${dirPath}/${slug}.pdf`,
})

beforeEach(() => {
  resetMockInvoke()
})

describe('useStarred', () => {
  it('loads starred slugs from directories', async () => {
    mockInvoke('get_starred', (args?: Record<string, unknown>) => {
      if (args?.dirPath === '/dir1') return ['book_a']
      return []
    })

    const textbooks = [
      makeTextbook('book_a', '/dir1'),
      makeTextbook('book_b', '/dir1'),
    ]

    const { result } = renderHook(() => useStarred(textbooks))

    await waitFor(() => {
      expect(result.current.starred['book_a']).toBe(true)
    })
    expect(result.current.starred['book_b']).toBeUndefined()
  })

  it('toggling starred calls invoke and optimistically updates state', async () => {
    mockInvoke('get_starred', [])
    mockInvoke('toggle_starred', true)

    const textbooks = [makeTextbook('book_x', '/mydir')]

    const { result } = renderHook(() => useStarred(textbooks))

    await waitFor(() => {
      expect(result.current.starred).toBeDefined()
    })

    // Toggle on
    await act(async () => {
      await result.current.toggle('book_x')
    })

    // Optimistic update: starred immediately
    expect(result.current.starred['book_x']).toBe(true)

    // IPC call was made
    const calls = getInvokeCallsFor('toggle_starred')
    expect(calls.length).toBe(1)
    expect(calls[0].args?.slug).toBe('book_x')
    expect(calls[0].args?.dirPath).toBe('/mydir')
  })

  it('reverts optimistic update on error', async () => {
    // Initially starred
    mockInvoke('get_starred', ['book_y'])

    const textbooks = [makeTextbook('book_y', '/mydir')]

    const { result } = renderHook(() => useStarred(textbooks))

    await waitFor(() => {
      expect(result.current.starred['book_y']).toBe(true)
    })

    // Now make toggle_starred fail
    mockInvokeError('toggle_starred', 'disk error')
    // get_starred still returns the original state for the revert reload
    mockInvoke('get_starred', ['book_y'])

    await act(async () => {
      await result.current.toggle('book_y')
    })

    // After error, should revert to original starred state by reloading
    await waitFor(() => {
      expect(result.current.starred['book_y']).toBe(true)
    })
  })

  it('toggling un-stars an already-starred book optimistically', async () => {
    mockInvoke('get_starred', ['book_z'])
    mockInvoke('toggle_starred', false)

    const textbooks = [makeTextbook('book_z', '/mydir')]

    const { result } = renderHook(() => useStarred(textbooks))

    await waitFor(() => {
      expect(result.current.starred['book_z']).toBe(true)
    })

    await act(async () => {
      await result.current.toggle('book_z')
    })

    // Optimistic update removes the star
    expect(result.current.starred['book_z']).toBeUndefined()
  })
})
