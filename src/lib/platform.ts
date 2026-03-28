import { useSyncExternalStore } from 'react'

export interface PlatformInfo {
  os: string
  isMobile: boolean
  isDesktop: boolean
}

const MOBILE_PLATFORMS = new Set(['android', 'ios'])

export function getPlatformType(os: string): PlatformInfo {
  const isMobile = MOBILE_PLATFORMS.has(os)
  return { os, isMobile, isDesktop: !isMobile }
}

// Module-level store (same pattern as readerState.ts)
let _platform: PlatformInfo = { os: 'linux', isMobile: false, isDesktop: true }
const _listeners = new Set<() => void>()

function notify() {
  _listeners.forEach((fn) => fn())
}

export function setPlatform(os: string) {
  _platform = getPlatformType(os)
  notify()
}

export function getPlatformInfo(): PlatformInfo {
  return _platform
}

function subscribe(fn: () => void): () => void {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}

function getSnapshot(): PlatformInfo {
  return _platform
}

export function usePlatform(): PlatformInfo {
  return useSyncExternalStore(subscribe, getSnapshot)
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    _platform = { os: 'linux', isMobile: false, isDesktop: true }
    _listeners.clear()
  })
}
