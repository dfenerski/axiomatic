import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { getPlatformInfo } from '../lib/platform'

export interface Directory {
  id: number
  path: string
  label: string
  added_at: string
}

export function useDirectories() {
  const [directories, setDirectories] = useState<Directory[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const dirs = await invoke<Directory[]>('list_directories')
      setDirectories(dirs)
    } catch (err) {
      console.error('Failed to list directories:', err)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: fetch on mount
    refresh()
  }, [refresh])

  const add = useCallback(async () => {
    setError(null)
    try {
      const { isMobile } = getPlatformInfo()
      let selected: string | null = null

      if (isMobile) {
        // Mobile: use native Android folder picker via our custom plugin
        selected = await invoke<string>('pick_folder')
      } else {
        // Desktop: use tauri-plugin-dialog
        selected = await open({ directory: true, multiple: false }) as string | null
      }

      if (!selected) {
        return null
      }
      const dir = await invoke<Directory>('add_directory', { path: selected })
      await refresh()
      return dir
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Don't show error for user cancellation
      if (!msg.includes('cancelled') && !msg.includes('canceled')) {
        setError(msg)
      }
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

  const clearError = useCallback(() => setError(null), [])

  return { directories, add, remove, refresh, error, clearError }
}
