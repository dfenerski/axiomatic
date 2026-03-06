import { useSyncExternalStore } from 'react'
import { createLocalStorageStore } from '../lib/createStore'

export type PomodoroPreset = '25/5' | '50/10' | 'custom'

export interface PomodoroConfig {
  preset: PomodoroPreset
  workMinutes: number
  breakMinutes: number
  audioEnabled: boolean
  longBreakMultiplier: number
  longBreakInterval: number
}

const STORAGE_KEY = 'axiomatic:pomodoro-config'

const DEFAULT_CONFIG: PomodoroConfig = {
  preset: '25/5',
  workMinutes: 25,
  breakMinutes: 5,
  audioEnabled: true,
  longBreakMultiplier: 3,
  longBreakInterval: 4,
}

function loadConfig(): PomodoroConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CONFIG
    const parsed = JSON.parse(raw)
    return {
      preset: parsed.preset ?? DEFAULT_CONFIG.preset,
      workMinutes: typeof parsed.workMinutes === 'number' ? parsed.workMinutes : DEFAULT_CONFIG.workMinutes,
      breakMinutes: typeof parsed.breakMinutes === 'number' ? parsed.breakMinutes : DEFAULT_CONFIG.breakMinutes,
      audioEnabled: typeof parsed.audioEnabled === 'boolean' ? parsed.audioEnabled : DEFAULT_CONFIG.audioEnabled,
      longBreakMultiplier: typeof parsed.longBreakMultiplier === 'number' ? parsed.longBreakMultiplier : DEFAULT_CONFIG.longBreakMultiplier,
      longBreakInterval: typeof parsed.longBreakInterval === 'number' ? parsed.longBreakInterval : DEFAULT_CONFIG.longBreakInterval,
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

const store = createLocalStorageStore(STORAGE_KEY, loadConfig)

export function savePomodoroConfig(config: PomodoroConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  store.emitChange()
}

export function applyPreset(preset: PomodoroPreset, current: PomodoroConfig): PomodoroConfig {
  switch (preset) {
    case '25/5':
      return { ...current, preset, workMinutes: 25, breakMinutes: 5 }
    case '50/10':
      return { ...current, preset, workMinutes: 50, breakMinutes: 10 }
    case 'custom':
      return { ...current, preset }
  }
}

export function usePomodoroConfig(): PomodoroConfig {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}
