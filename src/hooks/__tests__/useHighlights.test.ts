import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { mockInvoke, resetMockInvoke, getInvokeCallsFor } from '../../__mocks__/@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core')

import { useHighlights } from '../useHighlights'
import type { Highlight } from '../useHighlights'

function makeHighlight(overrides: Partial<Highlight> = {}): Highlight {
  return {
    id: 1,
    slug: 'test_book',
    page: 1,
    x: 0.1,
    y: 0.2,
    width: 0.5,
    height: 0.1,
    color: 'yellow',
    note: '',
    text: 'some text',
    group_id: 'group-1',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  resetMockInvoke()
})

describe('useHighlights', () => {
  it('loads highlights on mount', async () => {
    const h1 = makeHighlight({ id: 1, color: 'yellow' })
    const h2 = makeHighlight({ id: 2, color: 'bookmark' })
    mockInvoke('list_highlights', [h1, h2])

    const { result } = renderHook(() => useHighlights('test_book'))

    await waitFor(() => {
      expect(result.current.highlights.length).toBe(2)
    })

    const listCalls = getInvokeCallsFor('list_highlights')
    expect(listCalls.length).toBe(1)
    expect(listCalls[0].args?.slug).toBe('test_book')
  })

  it('createHighlight calls IPC and appends to local state', async () => {
    mockInvoke('list_highlights', [])
    const created = makeHighlight({ id: 10, color: 'green' })
    mockInvoke('create_highlight', created)

    const { result } = renderHook(() => useHighlights('test_book'))

    await waitFor(() => {
      expect(result.current.highlights).toBeDefined()
    })

    await act(async () => {
      await result.current.createHighlight(1, 0.1, 0.2, 0.5, 0.1, 'green', 'my note', 'some text', 'grp-1')
    })

    expect(result.current.highlights.length).toBe(1)
    expect(result.current.highlights[0].id).toBe(10)

    const calls = getInvokeCallsFor('create_highlight')
    expect(calls.length).toBe(1)
    expect(calls[0].args?.color).toBe('green')
    expect(calls[0].args?.slug).toBe('test_book')
  })

  it('deleteHighlight removes a single highlight from local state', async () => {
    const h1 = makeHighlight({ id: 1 })
    const h2 = makeHighlight({ id: 2 })
    mockInvoke('list_highlights', [h1, h2])
    mockInvoke('delete_highlight', null)

    const { result } = renderHook(() => useHighlights('test_book'))

    await waitFor(() => {
      expect(result.current.highlights.length).toBe(2)
    })

    await act(async () => {
      await result.current.deleteHighlight(1)
    })

    expect(result.current.highlights.length).toBe(1)
    expect(result.current.highlights[0].id).toBe(2)

    const calls = getInvokeCallsFor('delete_highlight')
    expect(calls.length).toBe(1)
    expect(calls[0].args?.id).toBe(1)
  })

  it('deleteHighlightGroup removes all highlights with the given group_id', async () => {
    const h1 = makeHighlight({ id: 1, group_id: 'grp-A' })
    const h2 = makeHighlight({ id: 2, group_id: 'grp-A' })
    const h3 = makeHighlight({ id: 3, group_id: 'grp-B' })
    mockInvoke('list_highlights', [h1, h2, h3])
    mockInvoke('delete_highlight_group', null)

    const { result } = renderHook(() => useHighlights('test_book'))

    await waitFor(() => {
      expect(result.current.highlights.length).toBe(3)
    })

    await act(async () => {
      await result.current.deleteHighlightGroup('grp-A')
    })

    expect(result.current.highlights.length).toBe(1)
    expect(result.current.highlights[0].group_id).toBe('grp-B')

    const calls = getInvokeCallsFor('delete_highlight_group')
    expect(calls.length).toBe(1)
    expect(calls[0].args?.groupId).toBe('grp-A')
  })

  it('filters bookmarks (color="bookmark") into bookmarkHighlights', async () => {
    const highlight = makeHighlight({ id: 1, color: 'yellow', page: 1 })
    const bookmark = makeHighlight({ id: 2, color: 'bookmark', page: 2 })
    const bookmark2 = makeHighlight({ id: 3, color: 'bookmark', page: 1 })
    mockInvoke('list_highlights', [highlight, bookmark, bookmark2])

    const { result } = renderHook(() => useHighlights('test_book'))

    await waitFor(() => {
      expect(result.current.highlights.length).toBe(3)
    })

    expect(result.current.colorHighlights.length).toBe(1)
    expect(result.current.colorHighlights[0].color).toBe('yellow')

    expect(result.current.bookmarkHighlights.length).toBe(2)
    expect(result.current.bookmarkHighlights.every((h) => h.color === 'bookmark')).toBe(true)
  })

  it('highlightsForPage returns highlights filtered by page', async () => {
    const h1 = makeHighlight({ id: 1, page: 1, color: 'yellow' })
    const h2 = makeHighlight({ id: 2, page: 2, color: 'green' })
    const h3 = makeHighlight({ id: 3, page: 1, color: 'blue' })
    mockInvoke('list_highlights', [h1, h2, h3])

    const { result } = renderHook(() => useHighlights('test_book'))

    await waitFor(() => {
      expect(result.current.highlights.length).toBe(3)
    })

    const page1 = result.current.highlightsForPage(1)
    expect(page1.length).toBe(2)
    expect(page1.map((h) => h.id).sort()).toEqual([1, 3])

    const page2 = result.current.highlightsForPage(2)
    expect(page2.length).toBe(1)
    expect(page2[0].id).toBe(2)
  })

  it('does not load when slug is undefined', () => {
    const { result } = renderHook(() => useHighlights(undefined))
    expect(result.current.highlights).toEqual([])
    expect(getInvokeCallsFor('list_highlights').length).toBe(0)
  })
})
