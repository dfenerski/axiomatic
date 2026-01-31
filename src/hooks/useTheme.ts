import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'

type Theme = 'system' | 'light' | 'dark'
type Resolved = 'light' | 'dark'

const STORAGE_KEY = 'axiomatic:theme'
const POLL_INTERVAL = 3000

let listeners: Array<() => void> = []
let osTheme: 'light' | 'dark' = 'dark' // default until detected

function emit() {
  listeners.forEach((l) => l())
}

function getSnapshot(): Theme {
  const v = localStorage.getItem(STORAGE_KEY)
  if (v === 'light' || v === 'dark') return v
  return 'system'
}

function subscribe(cb: () => void) {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

function systemIsDark() {
  return osTheme === 'dark'
}

function apply(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && systemIsDark())
  document.documentElement.classList.toggle('dark', dark)
}

function pollOsTheme() {
  invoke<string>('detect_os_theme')
    .then((t) => {
      const detected = t === 'dark' ? 'dark' : 'light' as const
      if (detected !== osTheme) {
        osTheme = detected
        if (getSnapshot() === 'system') {
          apply('system')
          emit()
        }
      }
    })
    .catch(() => {})
}

// Initial detection + start polling for OS theme changes
pollOsTheme()
setInterval(pollOsTheme, POLL_INTERVAL)

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot)
  const resolved: Resolved =
    theme === 'system' ? (systemIsDark() ? 'dark' : 'light') : theme

  useEffect(() => {
    apply(theme)
  }, [theme])

  const cycle = useCallback(() => {
    const current = getSnapshot()
    const next: Theme =
      current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system'
    if (next === 'system') {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, next)
    }
    apply(next)
    emit()
  }, [])

  return { theme, resolved, cycle }
}
