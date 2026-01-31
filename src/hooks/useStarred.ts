import { useCallback, useSyncExternalStore } from 'react'
import {
  type StarredSet,
  loadStarred,
  toggleStarred as toggleStarredLib,
} from '../lib/starred'
import { createLocalStorageStore } from '../lib/createStore'

const store = createLocalStorageStore<StarredSet>('axiomatic:starred', loadStarred)

export function useStarred() {
  const starred: StarredSet = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => ({}) as StarredSet,
  )

  const toggle = useCallback((slug: string) => {
    toggleStarredLib(slug)
    store.emitChange()
  }, [])

  return { starred, toggle }
}
