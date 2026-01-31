import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface Textbook {
  slug: string
  title: string
  file: string
  dir_id: number
  dir_path: string
  full_path: string
}

export function useTextbooks() {
  const [textbooks, setTextbooks] = useState<Textbook[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const books = await invoke<Textbook[]>('list_textbooks')
      setTextbooks(books)
    } catch (err) {
      console.error('Failed to list textbooks:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { textbooks, loading, refresh }
}
