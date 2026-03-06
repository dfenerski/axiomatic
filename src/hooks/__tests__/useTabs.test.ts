import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import type { OpenTab } from '../useTabs'

const STORAGE_KEY = 'axiomatic:tabs'

function makeTab(slug: string): OpenTab {
  return {
    slug,
    title: `Title ${slug}`,
    fullPath: `/dir/${slug}.pdf`,
    route: `/read/${slug}`,
  }
}

// We need to clear localStorage and re-import useTabs fresh for each test
// because the module has a module-level store and closedTabsStack
let useTabs: typeof import('../useTabs').useTabs

beforeEach(async () => {
  localStorage.clear()
  // Dynamic re-import to reset module-level state
  // Note: vitest module cache may prevent true reset, but localStorage clear
  // resets the external state the store reads from
  const mod = await import('../useTabs')
  useTabs = mod.useTabs
})

describe('useTabs', () => {
  it('starts with empty tabs and null activeSlug', () => {
    const { result } = renderHook(() => useTabs())
    expect(result.current.tabs).toEqual([])
    expect(result.current.activeSlug).toBeNull()
  })

  it('openTab adds a tab and sets it as active', () => {
    const { result } = renderHook(() => useTabs())
    const tab = makeTab('book_a')

    act(() => {
      result.current.openTab(tab)
    })

    expect(result.current.tabs.length).toBe(1)
    expect(result.current.tabs[0].slug).toBe('book_a')
    expect(result.current.activeSlug).toBe('book_a')

    // Verify localStorage persistence
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(stored.tabs.length).toBe(1)
    expect(stored.activeSlug).toBe('book_a')
  })

  it('openTab does not duplicate an already-open tab', () => {
    const { result } = renderHook(() => useTabs())
    const tab = makeTab('book_a')

    act(() => {
      result.current.openTab(tab)
    })
    act(() => {
      result.current.openTab(tab)
    })

    expect(result.current.tabs.length).toBe(1)
    expect(result.current.activeSlug).toBe('book_a')
  })

  it('closeTab removes the tab and activates an adjacent tab', () => {
    const { result } = renderHook(() => useTabs())

    act(() => {
      result.current.openTab(makeTab('book_a'))
    })
    act(() => {
      result.current.openTab(makeTab('book_b'))
    })
    act(() => {
      result.current.openTab(makeTab('book_c'))
    })

    // Active is book_c (last opened). Close it.
    act(() => {
      result.current.closeTab('book_c')
    })

    expect(result.current.tabs.length).toBe(2)
    expect(result.current.tabs.map((t) => t.slug)).toEqual(['book_a', 'book_b'])
    // Should activate adjacent tab (book_b, since book_c was the last)
    expect(result.current.activeSlug).toBe('book_b')
  })

  it('closeTab sets activeSlug to null when last tab is closed', () => {
    const { result } = renderHook(() => useTabs())

    act(() => {
      result.current.openTab(makeTab('only_book'))
    })
    act(() => {
      result.current.closeTab('only_book')
    })

    expect(result.current.tabs.length).toBe(0)
    expect(result.current.activeSlug).toBeNull()
  })

  it('reopenTab restores the last closed tab', () => {
    const { result } = renderHook(() => useTabs())

    act(() => {
      result.current.openTab(makeTab('book_a'))
    })
    act(() => {
      result.current.openTab(makeTab('book_b'))
    })

    // Close book_b
    act(() => {
      result.current.closeTab('book_b')
    })

    expect(result.current.tabs.length).toBe(1)

    // Reopen
    let reopened: OpenTab | null = null
    act(() => {
      reopened = result.current.reopenTab()
    })

    expect(reopened).not.toBeNull()
    expect(reopened!.slug).toBe('book_b')
    expect(result.current.tabs.length).toBe(2)
    expect(result.current.activeSlug).toBe('book_b')
  })

  it('reopenTab returns null when no closed tabs exist', () => {
    const { result } = renderHook(() => useTabs())

    let reopened: OpenTab | null = null
    act(() => {
      reopened = result.current.reopenTab()
    })

    expect(reopened).toBeNull()
  })

  it('preserves tab order when opening multiple tabs', () => {
    const { result } = renderHook(() => useTabs())

    act(() => {
      result.current.openTab(makeTab('book_a'))
    })
    act(() => {
      result.current.openTab(makeTab('book_b'))
    })
    act(() => {
      result.current.openTab(makeTab('book_c'))
    })

    expect(result.current.tabs.map((t) => t.slug)).toEqual(['book_a', 'book_b', 'book_c'])
  })

  it('setActiveTab switches active without modifying tab list', () => {
    const { result } = renderHook(() => useTabs())

    act(() => {
      result.current.openTab(makeTab('book_a'))
    })
    act(() => {
      result.current.openTab(makeTab('book_b'))
    })

    expect(result.current.activeSlug).toBe('book_b')

    act(() => {
      result.current.setActiveTab('book_a')
    })

    expect(result.current.activeSlug).toBe('book_a')
    expect(result.current.tabs.length).toBe(2)
  })

  it('closeOtherTabs keeps only the specified tab', () => {
    const { result } = renderHook(() => useTabs())

    act(() => {
      result.current.openTab(makeTab('book_a'))
    })
    act(() => {
      result.current.openTab(makeTab('book_b'))
    })
    act(() => {
      result.current.openTab(makeTab('book_c'))
    })

    act(() => {
      result.current.closeOtherTabs('book_b')
    })

    expect(result.current.tabs.length).toBe(1)
    expect(result.current.tabs[0].slug).toBe('book_b')
    expect(result.current.activeSlug).toBe('book_b')
  })
})
