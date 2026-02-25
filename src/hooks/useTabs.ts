import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { createLocalStorageStore } from '../lib/createStore'

export interface OpenTab {
  slug: string
  title: string
  fullPath: string
  route: string
}

interface TabsState {
  tabs: OpenTab[]
  activeSlug: string | null
}

const STORAGE_KEY = 'axiomatic:tabs'

function loadTabs(): TabsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { tabs: [], activeSlug: null }
    const state = JSON.parse(raw) as TabsState
    // Migrate tabs persisted without the route field
    for (const tab of state.tabs) {
      if (!tab.route) {
        tab.route = `/read/${tab.slug}`
      }
    }
    return state
  } catch {
    return { tabs: [], activeSlug: null }
  }
}

function saveTabs(state: TabsState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

const store = createLocalStorageStore<TabsState>(STORAGE_KEY, loadTabs)
const closedTabsStack: OpenTab[] = []

export function useTabs() {
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => ({ tabs: [], activeSlug: null } as TabsState),
  )

  const openTab = useCallback((tab: OpenTab) => {
    const current = loadTabs()
    const exists = current.tabs.some((t) => t.slug === tab.slug)
    if (!exists) {
      current.tabs.push(tab)
    }
    current.activeSlug = tab.slug
    saveTabs(current)
    store.emitChange()
  }, [])

  const closeTab = useCallback((slug: string): string | null => {
    const current = loadTabs()
    const idx = current.tabs.findIndex((t) => t.slug === slug)
    if (idx === -1) return current.activeSlug

    closedTabsStack.push(current.tabs[idx])
    current.tabs.splice(idx, 1)

    if (current.activeSlug === slug) {
      // Activate adjacent tab
      if (current.tabs.length > 0) {
        current.activeSlug = current.tabs[Math.min(idx, current.tabs.length - 1)].slug
      } else {
        current.activeSlug = null
      }
    }

    saveTabs(current)
    store.emitChange()
    return current.activeSlug
  }, [])

  const reopenTab = useCallback((): OpenTab | null => {
    const tab = closedTabsStack.pop()
    if (!tab) return null
    const current = loadTabs()
    if (!current.tabs.some((t) => t.slug === tab.slug)) {
      current.tabs.push(tab)
    }
    current.activeSlug = tab.slug
    saveTabs(current)
    store.emitChange()
    return tab
  }, [])

  const closeOtherTabs = useCallback((keepSlug: string): void => {
    const current = loadTabs()
    const kept = current.tabs.filter((t) => t.slug === keepSlug)
    const closed = current.tabs.filter((t) => t.slug !== keepSlug)
    for (const tab of closed) closedTabsStack.push(tab)
    current.tabs = kept
    current.activeSlug = keepSlug
    saveTabs(current)
    store.emitChange()
  }, [])

  const setActiveTab = useCallback((slug: string) => {
    const current = loadTabs()
    if (current.tabs.some((t) => t.slug === slug)) {
      current.activeSlug = slug
      saveTabs(current)
      store.emitChange()
    }
  }, [])

  return {
    tabs: state.tabs,
    activeSlug: state.activeSlug,
    openTab,
    closeTab,
    closeOtherTabs,
    reopenTab,
    setActiveTab,
  }
}

/**
 * Wraps useTabs with route-aware navigation helpers.
 * Eliminates the need for each page to maintain its own tabsRef
 * and duplicate handleTabSelect / handleTabClose logic.
 */
export function useTabNavigation(currentSlug: string | undefined) {
  const tabState = useTabs()
  const navigate = useNavigate()
  const tabsRef = useRef(tabState.tabs)
  useEffect(() => { tabsRef.current = tabState.tabs }, [tabState.tabs])

  const selectTab = useCallback((slug: string) => {
    tabState.setActiveTab(slug)
    const tab = tabsRef.current.find((t) => t.slug === slug)
    navigate(tab?.route || `/read/${slug}`)
  }, [navigate, tabState.setActiveTab])

  const closeTabAndNavigate = useCallback((slug: string) => {
    const nextSlug = tabState.closeTab(slug)
    if (nextSlug && nextSlug !== currentSlug) {
      const nextTab = tabsRef.current.find((t) => t.slug === nextSlug)
      navigate(nextTab?.route || `/read/${nextSlug}`)
    } else if (!nextSlug) {
      navigate('/')
    }
  }, [tabState.closeTab, navigate, currentSlug])

  const closeOtherTabsAndNavigate = useCallback((keepSlug: string) => {
    tabState.closeOtherTabs(keepSlug)
    if (keepSlug !== currentSlug) {
      const tab = tabsRef.current.find((t) => t.slug === keepSlug)
      navigate(tab?.route || `/read/${keepSlug}`)
    }
  }, [tabState.closeOtherTabs, navigate, currentSlug])

  return { ...tabState, tabsRef, selectTab, closeTabAndNavigate, closeOtherTabsAndNavigate }
}
