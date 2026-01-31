import { migrateNotesFromJson } from './notes'

const NOTES_SQLITE_KEY = 'axiomatic:migrated-notes-to-sqlite'

export async function migrateNotesToSqlite(): Promise<void> {
  if (localStorage.getItem(NOTES_SQLITE_KEY)) return

  const raw = localStorage.getItem('axiomatic:notes')
  if (raw) {
    try {
      await migrateNotesFromJson(raw)
    } catch {
      // If migration fails, don't set the flag so it retries
      return
    }
  }
  localStorage.setItem(NOTES_SQLITE_KEY, new Date().toISOString())
}
