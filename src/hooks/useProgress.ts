import { useCallback, useSyncExternalStore } from 'react'
import type { BookProgress, ProgressMap } from '../types/progress'
import { loadProgress, updateBookProgress } from '../lib/progress'

const STORAGE_KEY = 'axiomatic:progress'
let listeners: Array<() => void> = []
let snapshot = loadProgress()

function subscribe(cb: () => void) {
  listeners = [...listeners, cb]
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

function emitChange() {
  snapshot = loadProgress()
  for (const l of listeners) l()
}

// Listen for storage events from other tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) emitChange()
  })
}

export function useProgress() {
  const progress: ProgressMap = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => ({}) as ProgressMap,
  )

  const update = useCallback(
    (slug: string, patch: Partial<BookProgress>) => {
      updateBookProgress(slug, patch)
      emitChange()
    },
    [],
  )

  return { progress, update }
}
