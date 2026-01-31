import { useCallback, useSyncExternalStore } from 'react'
import {
  type StarredSet,
  loadStarred,
  toggleStarred as toggleStarredLib,
} from '../lib/starred'

const STORAGE_KEY = 'axiomatic:starred'
let listeners: Array<() => void> = []
let snapshot = loadStarred()

function subscribe(cb: () => void) {
  listeners = [...listeners, cb]
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

function emitChange() {
  snapshot = loadStarred()
  for (const l of listeners) l()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) emitChange()
  })
}

export function useStarred() {
  const starred: StarredSet = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => ({}) as StarredSet,
  )

  const toggle = useCallback((slug: string) => {
    toggleStarredLib(slug)
    emitChange()
  }, [])

  return { starred, toggle }
}
