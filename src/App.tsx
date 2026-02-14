import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { router } from './router'
import { migrateNotesToSqlite } from './lib/migrate'

async function openFileByPath(filePath: string) {
  try {
    const slug = await invoke<string>('open_file', { filePath })
    router.navigate(`/read/${slug}`)
  } catch (e) {
    console.error('Failed to open file:', e)
  }
}

export default function App() {
  useEffect(() => {
    migrateNotesToSqlite()
  }, [])

  useEffect(() => {
    // Check for a file passed via CLI args on startup
    invoke<string | null>('get_pending_file').then((path) => {
      if (path) openFileByPath(path)
    })

    // Listen for files opened while app is already running (single-instance)
    const unlisten = listen<string>('open-file', (event) => {
      openFileByPath(event.payload)
    })

    return () => {
      unlisten.then((f) => f())
    }
  }, [])

  return <RouterProvider router={router} />
}
