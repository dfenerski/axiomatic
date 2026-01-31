import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { getNote as getNoteSql, setNote as setNoteSql } from '../lib/notes'

type NoteCache = Map<string, string>

let cache: NoteCache = new Map()
let listeners: Array<() => void> = []
let snapshot = cache

function subscribe(cb: () => void) {
  listeners = [...listeners, cb]
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

function emitChange() {
  snapshot = new Map(cache)
  for (const l of listeners) l()
}

function cacheKey(slug: string, page: number) {
  return `${slug}:${page}`
}

const pendingFetches = new Set<string>()

export function useNotes() {
  const notes = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => new Map() as NoteCache,
  )

  const debounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    return () => {
      for (const t of debounceRef.current.values()) clearTimeout(t)
    }
  }, [])

  const getNote = useCallback(
    (slug: string, page: number): string => {
      const key = cacheKey(slug, page)
      if (cache.has(key)) {
        return cache.get(key)!
      }
      // Trigger async fetch if not already pending
      if (!pendingFetches.has(key)) {
        pendingFetches.add(key)
        getNoteSql(slug, page).then((record) => {
          pendingFetches.delete(key)
          const content = record?.content ?? ''
          cache.set(key, content)
          emitChange()
        })
      }
      return ''
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes],
  )

  const setNote = useCallback(
    (slug: string, page: number, content: string) => {
      const key = cacheKey(slug, page)
      // Optimistic update
      cache.set(key, content)
      emitChange()

      // Debounced write to SQLite
      const existing = debounceRef.current.get(key)
      if (existing) clearTimeout(existing)
      debounceRef.current.set(
        key,
        setTimeout(() => {
          debounceRef.current.delete(key)
          setNoteSql(slug, page, content, 'markdown')
        }, 150),
      )
    },
    [],
  )

  return { notes, setNote, getNote }
}
