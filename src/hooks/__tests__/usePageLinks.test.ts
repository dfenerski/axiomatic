import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  mockInvoke,
  resetMockInvoke,
  getInvokeCallsFor,
} from '../../../__mocks__/@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core')

import { usePageLinks } from '../usePageLinks'
import type { LinkAnnotation } from '../usePageLinks'

const internalLink: LinkAnnotation = {
  rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.04 },
  link_type: { type: 'internal', page: 10 },
}

const externalLink: LinkAnnotation = {
  rect: { x: 0.5, y: 0.6, width: 0.2, height: 0.04 },
  link_type: { type: 'external', url: 'https://example.com' },
}

beforeEach(() => {
  resetMockInvoke()
})

describe('usePageLinks', () => {
  it('returns empty array when fullPath is undefined', async () => {
    const { result } = renderHook(() => usePageLinks(undefined))

    let links: LinkAnnotation[] = []
    await act(async () => {
      links = await result.current.getLinks(1)
    })

    expect(links).toEqual([])
    expect(getInvokeCallsFor('get_page_links')).toHaveLength(0)
  })

  it('fetches links via IPC when fullPath is provided', async () => {
    mockInvoke('get_page_links', [internalLink, externalLink])

    const { result } = renderHook(() => usePageLinks('/books/algebra.pdf'))

    let links: LinkAnnotation[] = []
    await act(async () => {
      links = await result.current.getLinks(5)
    })

    expect(links).toHaveLength(2)
    expect(links[0].link_type).toEqual({ type: 'internal', page: 10 })
    expect(links[1].link_type).toEqual({ type: 'external', url: 'https://example.com' })

    const calls = getInvokeCallsFor('get_page_links')
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toEqual({ path: '/books/algebra.pdf', page: 5 })
  })

  it('caches results and does not re-invoke for same path+page', async () => {
    mockInvoke('get_page_links', [internalLink])

    const { result } = renderHook(() => usePageLinks('/books/algebra.pdf'))

    // First call
    await act(async () => {
      await result.current.getLinks(3)
    })

    // Second call for same page
    let links: LinkAnnotation[] = []
    await act(async () => {
      links = await result.current.getLinks(3)
    })

    // Should still have data from cache
    expect(links).toHaveLength(1)
    // IPC should only have been called once (cached on second call)
    expect(getInvokeCallsFor('get_page_links')).toHaveLength(1)
  })

  it('returns empty array when IPC call fails', async () => {
    mockInvoke('get_page_links', () => { throw new Error('pdf error') })

    // Use a unique path to avoid cache from previous tests
    const { result } = renderHook(() => usePageLinks('/books/fails.pdf'))

    let links: LinkAnnotation[] = []
    await act(async () => {
      links = await result.current.getLinks(1)
    })

    expect(links).toEqual([])
  })
})
