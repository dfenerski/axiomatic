import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'

type Theme = 'system' | 'light' | 'dark'
type Resolved = 'light' | 'dark'

const STORAGE_KEY = 'axiomatic:theme'
const POLL_INTERVAL = 3000

let listeners: Array<() => void> = []
let osTheme: 'light' | 'dark' = 'dark' // default until detected

const mq = window.matchMedia('(prefers-color-scheme: dark)')

function emit() {
  listeners.forEach((l) => l())
}

function getTheme(): Theme {
  const v = localStorage.getItem(STORAGE_KEY)
  if (v === 'light' || v === 'dark') return v
  return 'system'
}

function systemIsDark() {
  return osTheme === 'dark'
}

function resolve(theme: Theme): Resolved {
  return theme === 'system' ? (systemIsDark() ? 'dark' : 'light') : theme
}

function apply(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && systemIsDark())
  document.documentElement.classList.toggle('dark', dark)
}

function getSnapshot(): string {
  const theme = getTheme()
  return `${theme}:${resolve(theme)}`
}

function parseSnapshot(snap: string): { theme: Theme; resolved: Resolved } {
  const [theme, resolved] = snap.split(':') as [Theme, Resolved]
  return { theme, resolved }
}

function subscribe(cb: () => void) {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

function onOsThemeChange(dark: boolean) {
  const detected = dark ? 'dark' : 'light' as const
  if (detected !== osTheme) {
    osTheme = detected
    if (getTheme() === 'system') {
      apply('system')
      emit()
    }
  }
}

// Primary: matchMedia fires instantly when available
mq.addEventListener('change', (e) => onOsThemeChange(e.matches))

// Fallback: poll via Tauri IPC for webviews where matchMedia doesn't reflect OS
function pollOsTheme() {
  invoke<string>('detect_os_theme')
    .then((t) => onOsThemeChange(t === 'dark'))
    .catch(() => {})
}

// Seed initial value from both sources
osTheme = mq.matches ? 'dark' : 'light'
pollOsTheme()
setInterval(pollOsTheme, POLL_INTERVAL)

// Apply on load
apply(getTheme())

export function useTheme() {
  const snap = useSyncExternalStore(subscribe, getSnapshot)
  const { theme, resolved } = parseSnapshot(snap)

  useEffect(() => {
    apply(theme)
  }, [theme])

  const cycle = useCallback(() => {
    const current = getTheme()
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
