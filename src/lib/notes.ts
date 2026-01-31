import type { NotesMap } from '../types/notes'

const STORAGE_KEY = 'axiomatic:notes'

export function loadNotes(): NotesMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as NotesMap) : {}
  } catch {
    return {}
  }
}

export function saveNotes(map: NotesMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function getNoteKey(slug: string, page: number): string {
  return `${slug}:${page}`
}

export function getNote(slug: string, page: number): string {
  return loadNotes()[getNoteKey(slug, page)] ?? ''
}

export function setNote(slug: string, page: number, content: string): void {
  const map = loadNotes()
  const key = getNoteKey(slug, page)
  const isEmpty = !content || content === '<p></p>'
  if (isEmpty) {
    delete map[key]
  } else {
    map[key] = content
  }
  saveNotes(map)
}
