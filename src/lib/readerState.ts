// Module-level reader state so the command palette (in Layout) can
// conditionally show/hide commands based on ReaderPage state.
// ReaderPage calls the setters; router.tsx reads via useSyncExternalStore.

let _snipMode = false
let _hasSnips = false
let _zenMode = false
let _learningTools = false
const _listeners = new Set<() => void>()

function notify() {
  _listeners.forEach((fn) => fn())
}

export function setReaderSnipMode(v: boolean) {
  _snipMode = v
  notify()
}

export function setReaderHasSnips(v: boolean) {
  _hasSnips = v
  notify()
}

export function setReaderZenMode(v: boolean) {
  _zenMode = v
  notify()
}

export function setReaderLearningTools(v: boolean) {
  _learningTools = v
  notify()
}

export function getReaderSnipMode() {
  return _snipMode
}

export function getReaderHasSnips() {
  return _hasSnips
}

export function subscribeReaderState(fn: () => void): () => void {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}

/** Snapshot object — reference-stable when values haven't changed. */
let _snapshot = { snipMode: _snipMode, hasSnips: _hasSnips, zenMode: _zenMode, learningTools: _learningTools }

export function getReaderStateSnapshot() {
  if (
    _snapshot.snipMode !== _snipMode ||
    _snapshot.hasSnips !== _hasSnips ||
    _snapshot.zenMode !== _zenMode ||
    _snapshot.learningTools !== _learningTools
  ) {
    _snapshot = { snipMode: _snipMode, hasSnips: _hasSnips, zenMode: _zenMode, learningTools: _learningTools }
  }
  return _snapshot
}

// Reset module state on HMR to prevent stale values across hot reloads
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    _snipMode = false
    _hasSnips = false
    _zenMode = false
    _learningTools = false
    _listeners.clear()
    _snapshot = { snipMode: false, hasSnips: false, zenMode: false, learningTools: false }
  })
}
