import type { Textbook } from '../hooks/useTextbooks'

const MIGRATION_KEY = 'axiomatic:migrated-to-dir-slugs'

/**
 * One-time migration of localStorage keys from old slugs (filename-stem)
 * to new slugs ({dir_id}_{filename-stem}).
 *
 * Migrates: axiomatic:progress, axiomatic:starred, axiomatic:notes
 */
export function migrateLocalStorageKeys(textbooks: Textbook[]) {
  if (localStorage.getItem(MIGRATION_KEY)) return

  // Build a map from old slug (stem only) to new slug
  const oldToNew = new Map<string, string>()
  for (const book of textbooks) {
    // Old slug was the filename stem (without dir_id prefix)
    const oldSlug = book.file.replace(/\.pdf$/i, '')
    if (!oldToNew.has(oldSlug)) {
      oldToNew.set(oldSlug, book.slug)
    }
  }

  migrateMap('axiomatic:progress', oldToNew)
  migrateMap('axiomatic:starred', oldToNew)
  migrateMap('axiomatic:notes', oldToNew)

  localStorage.setItem(MIGRATION_KEY, new Date().toISOString())
}

function migrateMap(key: string, oldToNew: Map<string, string>) {
  const raw = localStorage.getItem(key)
  if (!raw) return
  try {
    const data = JSON.parse(raw) as Record<string, unknown>
    const migrated: Record<string, unknown> = {}
    let changed = false
    for (const [oldKey, value] of Object.entries(data)) {
      const newKey = oldToNew.get(oldKey)
      if (newKey && newKey !== oldKey) {
        migrated[newKey] = value
        changed = true
      } else {
        migrated[oldKey] = value
      }
    }
    if (changed) {
      localStorage.setItem(key, JSON.stringify(migrated))
    }
  } catch {
    // ignore parse failures
  }
}
