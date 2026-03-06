import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { mockInvoke, resetMockInvoke, getInvokeCallsFor } from '../../__mocks__/@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core')

import { useSnips } from '../useSnips'
import type { Snip } from '../useSnips'

const sampleSnip: Snip = {
  id: 'snip-1',
  slug: 'test_book',
  full_path: '/dir/test_book.pdf',
  page: 3,
  label: 'Theorem 2.1',
  x: 0.1,
  y: 0.2,
  width: 0.5,
  height: 0.3,
  created_at: '2024-01-01T00:00:00Z',
}

beforeEach(() => {
  resetMockInvoke()
})

describe('useSnips', () => {
  it('loads snips and XP on mount', async () => {
    mockInvoke('list_snips', [sampleSnip])
    mockInvoke('get_xp', 5)

    const { result } = renderHook(() => useSnips('test_book', '/dir'))

    await waitFor(() => {
      expect(result.current.snips.length).toBe(1)
    })

    expect(result.current.snips[0].label).toBe('Theorem 2.1')
    expect(result.current.xp).toBe(5)

    const listCalls = getInvokeCallsFor('list_snips')
    expect(listCalls.length).toBe(1)
    expect(listCalls[0].args?.slug).toBe('test_book')
    expect(listCalls[0].args?.dirPath).toBe('/dir')
  })

  it('addSnip calls create_snip and appends to local state', async () => {
    mockInvoke('list_snips', [])
    mockInvoke('get_xp', 0)

    const createdSnip: Snip = {
      ...sampleSnip,
      id: 'snip-new',
      label: 'New Snip',
    }
    mockInvoke('create_snip', createdSnip)

    const { result } = renderHook(() => useSnips('test_book', '/dir'))

    await waitFor(() => {
      expect(result.current.snips).toBeDefined()
    })

    await act(async () => {
      await result.current.addSnip('/dir/test_book.pdf', 3, 'New Snip', 0.1, 0.2, 0.5, 0.3)
    })

    expect(result.current.snips.length).toBe(1)
    expect(result.current.snips[0].id).toBe('snip-new')

    const createCalls = getInvokeCallsFor('create_snip')
    expect(createCalls.length).toBe(1)
    expect(createCalls[0].args?.label).toBe('New Snip')
    expect(createCalls[0].args?.page).toBe(3)
  })

  it('removeSnip calls delete_snip and removes from local state', async () => {
    mockInvoke('list_snips', [sampleSnip])
    mockInvoke('get_xp', 0)
    mockInvoke('delete_snip', null)

    const { result } = renderHook(() => useSnips('test_book', '/dir'))

    await waitFor(() => {
      expect(result.current.snips.length).toBe(1)
    })

    await act(async () => {
      await result.current.removeSnip('snip-1')
    })

    expect(result.current.snips.length).toBe(0)

    const deleteCalls = getInvokeCallsFor('delete_snip')
    expect(deleteCalls.length).toBe(1)
    expect(deleteCalls[0].args?.id).toBe('snip-1')
  })

  it('incrementXp calls increment_xp and updates local XP', async () => {
    mockInvoke('list_snips', [])
    mockInvoke('get_xp', 0)
    mockInvoke('increment_xp', 1)

    const { result } = renderHook(() => useSnips('test_book', '/dir'))

    await waitFor(() => {
      expect(result.current.xp).toBe(0)
    })

    let returnedXp: number | undefined
    await act(async () => {
      returnedXp = await result.current.incrementXp()
    })

    expect(returnedXp).toBe(1)
    expect(result.current.xp).toBe(1)

    const xpCalls = getInvokeCallsFor('increment_xp')
    expect(xpCalls.length).toBe(1)
    expect(xpCalls[0].args?.slug).toBe('test_book')
  })

  it('does not load when slug or dirPath is undefined', () => {
    const { result } = renderHook(() => useSnips(undefined, undefined))
    expect(result.current.snips).toEqual([])
    expect(result.current.xp).toBe(0)
    expect(getInvokeCallsFor('list_snips').length).toBe(0)
  })
})
