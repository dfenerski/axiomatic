import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  mockInvoke,
  resetMockInvoke,
  getInvokeCallsFor,
} from '../../../__mocks__/@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core')

import { useOutline } from '../useOutline'
import type { OutlineEntry } from '../useOutline'

const sampleOutline: OutlineEntry[] = [
  {
    title: 'Chapter 1',
    page: 1,
    children: [
      { title: 'Section 1.1', page: 5, children: [] },
    ],
  },
  {
    title: 'Chapter 2',
    page: 20,
    children: [],
  },
]

beforeEach(() => {
  resetMockInvoke()
})

describe('useOutline', () => {
  it('returns empty array when fullPath is undefined', () => {
    const { result } = renderHook(() => useOutline(undefined))

    expect(result.current).toEqual([])
    expect(getInvokeCallsFor('get_outline')).toHaveLength(0)
  })

  it('fetches outline when fullPath is provided', async () => {
    mockInvoke('get_outline', sampleOutline)

    const { result } = renderHook(() => useOutline('/books/algebra.pdf'))

    await waitFor(() => {
      expect(result.current).toHaveLength(2)
    })

    expect(result.current[0].title).toBe('Chapter 1')
    expect(result.current[0].children).toHaveLength(1)
    expect(result.current[1].title).toBe('Chapter 2')

    const calls = getInvokeCallsFor('get_outline')
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toEqual({ path: '/books/algebra.pdf' })
  })

  it('re-fetches when fullPath changes', async () => {
    mockInvoke('get_outline', sampleOutline)

    const { result, rerender } = renderHook(
      ({ path }) => useOutline(path),
      { initialProps: { path: '/books/algebra.pdf' } },
    )

    await waitFor(() => {
      expect(result.current).toHaveLength(2)
    })

    const outline2: OutlineEntry[] = [
      { title: 'Part A', page: 1, children: [] },
    ]
    mockInvoke('get_outline', outline2)

    rerender({ path: '/books/topology.pdf' })

    await waitFor(() => {
      expect(result.current).toHaveLength(1)
      expect(result.current[0].title).toBe('Part A')
    })

    const calls = getInvokeCallsFor('get_outline')
    expect(calls).toHaveLength(2)
    expect(calls[1].args).toEqual({ path: '/books/topology.pdf' })
  })
})
