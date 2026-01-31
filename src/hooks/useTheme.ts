import { useCallback, useEffect, useSyncExternalStore } from 'react'

type Theme = 'system' | 'light' | 'dark'
type Resolved = 'light' | 'dark'

const STORAGE_KEY = 'axiomatic:theme'
const mq = typeof window !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null

let listeners: Array<() => void> = []
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

function apply(theme: Theme) {
  const dark =
    theme === 'dark' || (theme === 'system' && !!mq?.matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot)
  const resolved: Resolved =
    theme === 'system' ? (mq?.matches ? 'dark' : 'light') : theme

  useEffect(() => {
    if (!mq) return
    const handler = () => {
      if (getSnapshot() === 'system') {
        apply('system')
        emit()
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

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
