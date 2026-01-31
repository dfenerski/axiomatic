export function createLocalStorageStore<T>(key: string, load: () => T) {
  let listeners: Array<() => void> = []
  let snapshot = load()

  function subscribe(cb: () => void) {
    listeners = [...listeners, cb]
    return () => {
      listeners = listeners.filter((l) => l !== cb)
    }
  }

  function emitChange() {
    snapshot = load()
    for (const l of listeners) l()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === key) emitChange()
    })
  }

  return { subscribe, getSnapshot: () => snapshot, emitChange }
}
