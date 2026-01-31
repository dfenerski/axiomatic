import { useCallback, useSyncExternalStore } from 'react'
import type { BookProgress, ProgressMap } from '../types/progress'
import { loadProgress, updateBookProgress } from '../lib/progress'
import { createLocalStorageStore } from '../lib/createStore'

const store = createLocalStorageStore<ProgressMap>('axiomatic:progress', loadProgress)

export function useProgress() {
  const progress: ProgressMap = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => ({}) as ProgressMap,
  )

  const update = useCallback(
    (slug: string, patch: Partial<BookProgress>) => {
      updateBookProgress(slug, patch)
      store.emitChange()
    },
    [],
  )

  return { progress, update }
}
