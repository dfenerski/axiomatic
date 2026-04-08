import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { mockInvoke, resetMockInvoke } from '../../../__mocks__/@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core')

import { useTextbooks } from '../useTextbooks'

beforeEach(() => {
  resetMockInvoke()
})

describe('useTextbooks', () => {
  it('returns textbooks array and refresh function', () => {
    const { result } = renderHook(() => useTextbooks())
    expect(result.current.textbooks).toBeDefined()
    expect(Array.isArray(result.current.textbooks)).toBe(true)
    expect(typeof result.current.refresh).toBe('function')
  })

  it('refresh calls list_textbooks and updates state', async () => {
    const books = [
      { slug: 'algebra', title: 'Algebra', file: 'algebra.pdf', dir_id: 1, dir_path: '/lib', full_path: '/lib/algebra.pdf' },
    ]
    mockInvoke('list_textbooks', books)

    const { result } = renderHook(() => useTextbooks())

    await act(async () => {
      await result.current.refresh()
    })

    await waitFor(() => {
      expect(result.current.textbooks).toEqual(books)
      expect(result.current.loading).toBe(false)
    })
  })
})
