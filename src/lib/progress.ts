import type { BookProgress, ProgressMap } from '../types/progress'

const STORAGE_KEY = 'axiomatic:progress'

export function loadProgress(): ProgressMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ProgressMap) : {}
  } catch {
    return {}
  }
}

export function saveProgress(map: ProgressMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function getBookProgress(slug: string): BookProgress | undefined {
  return loadProgress()[slug]
}

export function updateBookProgress(
  slug: string,
  patch: Partial<BookProgress>,
): void {
  const map = loadProgress()
  const existing = map[slug] ?? { currentPage: 1, totalPages: 0, lastReadAt: '' }
  map[slug] = {
    ...existing,
    ...patch,
    lastReadAt: new Date().toISOString(),
  }
  saveProgress(map)
}
