import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import {
  mockInvoke,
  resetMockInvoke,
  getInvokeCallsFor,
} from '../../../__mocks__/@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core')

import { useTags } from '../useTags'
import type { Tag } from '../useTags'

const tag1: Tag = { id: 1, name: 'math', color: '#dc322f' }
const tag2: Tag = { id: 2, name: 'physics', color: '#268bd2' }

beforeEach(() => {
  resetMockInvoke()
})

describe('useTags', () => {
  it('loads tags and bookTags on mount', async () => {
    mockInvoke('list_tags', [tag1, tag2])
    mockInvoke('list_book_tags_all', [
      { book_slug: 'algebra', tags: [tag1] },
    ])

    const { result } = renderHook(() => useTags())

    await waitFor(() => {
      expect(result.current.tags).toHaveLength(2)
    })

    expect(result.current.tags[0].name).toBe('math')
    expect(result.current.tags[1].name).toBe('physics')
    expect(result.current.bookTags['algebra']).toEqual([tag1])
  })

  it('createTag calls invoke and refreshes', async () => {
    mockInvoke('list_tags', [])
    mockInvoke('list_book_tags_all', [])
    mockInvoke('create_tag', { id: 3, name: 'cs', color: '#859900' })

    const { result } = renderHook(() => useTags())

    await waitFor(() => {
      expect(result.current.tags).toBeDefined()
    })

    // After createTag, refresh will re-fetch — set up new return values
    mockInvoke('list_tags', [{ id: 3, name: 'cs', color: '#859900' }])

    await act(async () => {
      await result.current.createTag('cs', '#859900')
    })

    const calls = getInvokeCallsFor('create_tag')
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toEqual({ name: 'cs', color: '#859900' })

    // Verify refresh was called after create
    await waitFor(() => {
      expect(result.current.tags).toHaveLength(1)
      expect(result.current.tags[0].name).toBe('cs')
    })
  })

  it('deleteTag calls invoke and refreshes', async () => {
    mockInvoke('list_tags', [tag1])
    mockInvoke('list_book_tags_all', [])
    mockInvoke('delete_tag', null)

    const { result } = renderHook(() => useTags())

    await waitFor(() => {
      expect(result.current.tags).toHaveLength(1)
    })

    // After delete, refresh returns empty
    mockInvoke('list_tags', [])

    await act(async () => {
      await result.current.deleteTag(1)
    })

    const calls = getInvokeCallsFor('delete_tag')
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toEqual({ id: 1 })

    await waitFor(() => {
      expect(result.current.tags).toHaveLength(0)
    })
  })

  it('tagBook and untagBook call invoke with correct args', async () => {
    mockInvoke('list_tags', [tag1])
    mockInvoke('list_book_tags_all', [])
    mockInvoke('tag_book', null)
    mockInvoke('untag_book', null)

    const { result } = renderHook(() => useTags())

    await waitFor(() => {
      expect(result.current.tags).toHaveLength(1)
    })

    await act(async () => {
      await result.current.tagBook('algebra', 1)
    })

    const tagCalls = getInvokeCallsFor('tag_book')
    expect(tagCalls).toHaveLength(1)
    expect(tagCalls[0].args).toEqual({ bookSlug: 'algebra', tagId: 1 })

    await act(async () => {
      await result.current.untagBook('algebra', 1)
    })

    const untagCalls = getInvokeCallsFor('untag_book')
    expect(untagCalls).toHaveLength(1)
    expect(untagCalls[0].args).toEqual({ bookSlug: 'algebra', tagId: 1 })
  })
})
