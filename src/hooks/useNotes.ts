import { useCallback, useSyncExternalStore } from 'react'
import type { NotesMap } from '../types/notes'
import { loadNotes, setNote as setNoteInLib } from '../lib/notes'

const STORAGE_KEY = 'axiomatic:notes'
let listeners: Array<() => void> = []
let snapshot = loadNotes()

function subscribe(cb: () => void) {
  listeners = [...listeners, cb]
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

function emitChange() {
  snapshot = loadNotes()
  for (const l of listeners) l()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) emitChange()
  })
}

export function useNotes() {
  const notes: NotesMap = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => ({}) as NotesMap,
  )

  const setNote = useCallback(
    (slug: string, page: number, content: string) => {
      setNoteInLib(slug, page, content)
      emitChange()
    },
    [],
  )

  const getNote = useCallback(
    (slug: string, page: number): string => {
      return notes[`${slug}:${page}`] ?? ''
    },
    [notes],
  )

  return { notes, setNote, getNote }
}
