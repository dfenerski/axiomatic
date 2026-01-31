import { invoke } from '@tauri-apps/api/core'

export interface NoteRecord {
  id: number
  slug: string
  page: number
  content: string
  format: string
  updated_at: string
}

export async function getNote(slug: string, page: number): Promise<NoteRecord | null> {
  return invoke<NoteRecord | null>('get_note', { slug, page })
}

export async function setNote(
  slug: string,
  page: number,
  content: string,
  format: string = 'markdown',
): Promise<void> {
  await invoke('set_note', { slug, page, content, format })
}

export async function listNotesForBook(slug: string): Promise<NoteRecord[]> {
  return invoke<NoteRecord[]>('list_notes_for_book', { slug })
}

export async function deleteNote(slug: string, page: number): Promise<void> {
  await invoke('delete_note', { slug, page })
}

export async function saveNoteImage(
  slug: string,
  page: number,
  filename: string,
  data: number[],
): Promise<number> {
  return invoke<number>('save_note_image', { slug, page, filename, data })
}

export async function getNoteImage(id: number): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>('get_note_image', { id })
}

export async function exportNotesForBook(slug: string): Promise<string> {
  return invoke<string>('export_notes_for_book', { slug })
}

export async function migrateNotesFromJson(jsonData: string): Promise<number> {
  return invoke<number>('migrate_notes_from_json', { jsonData })
}
