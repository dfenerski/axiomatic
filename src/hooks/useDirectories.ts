import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

export interface Directory {
  id: number
  path: string
  label: string
  added_at: string
}

export function useDirectories() {
  const [directories, setDirectories] = useState<Directory[]>([])

  const refresh = useCallback(async () => {
    try {
      const dirs = await invoke<Directory[]>('list_directories')
      setDirectories(dirs)
    } catch (err) {
      console.error('Failed to list directories:', err)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const add = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false })
    if (!selected) return null
    try {
      const dir = await invoke<Directory>('add_directory', { path: selected })
      await refresh()
      return dir
    } catch (err) {
      console.error('Failed to add directory:', err)
      return null
    }
  }, [refresh])

  const remove = useCallback(
    async (id: number) => {
      try {
        await invoke('remove_directory', { id })
        await refresh()
      } catch (err) {
        console.error('Failed to remove directory:', err)
      }
    },
    [refresh],
  )

  return { directories, add, remove, refresh }
}
