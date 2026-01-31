const STORAGE_KEY = 'axiomatic:starred'

export type StarredSet = Record<string, true>

export function loadStarred(): StarredSet {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

export function toggleStarred(slug: string): void {
  const current = loadStarred()
  if (current[slug]) {
    delete current[slug]
  } else {
    current[slug] = true
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
}
