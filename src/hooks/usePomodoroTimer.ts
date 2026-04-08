import { useEffect, useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { PomodoroConfig } from './usePomodoroConfig'

type Phase = 'work' | 'break'

export interface TimerState {
  running: boolean
  phase: Phase
  secondsLeft: number
  completedPomodoros: number
  showOverlay: boolean
  isLongBreak: boolean
  sessionStart: string | null
}

let _state: TimerState = {
  running: false,
  phase: 'work',
  secondsLeft: 25 * 60,
  completedPomodoros: 0,
  showOverlay: false,
  isLongBreak: false,
  sessionStart: null,
}

let _snapshot = { ..._state }
let _intervalId: ReturnType<typeof setInterval> | undefined
const _listeners = new Set<() => void>()
let _activeSlug: string | undefined
let _activeDirPath: string | undefined

function notify() {
  _snapshot = { ..._state }
  _listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void): () => void {
  const wasEmpty = _listeners.size === 0
  _listeners.add(fn)
  // Resume interval if timer was running when all components had unmounted
  if (wasEmpty && _state.running && _intervalId == null) {
    _intervalId = setInterval(tick, 1000)
  }
  return () => {
    _listeners.delete(fn)
    // Pause interval when no components are listening (timer stays "running" in state)
    if (_listeners.size === 0 && _intervalId != null) {
      clearInterval(_intervalId)
      _intervalId = undefined
    }
  }
}

function getSnapshot(): TimerState {
  return _snapshot
}

function playChime() {
  try {
    const ctx = new AudioContext()
    const makeOsc = (freq: number, start: number, end: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.3, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + end)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + end)
    }
    makeOsc(660, 0, 0.8)
    makeOsc(880, 0.3, 1.1)
  } catch { /* Audio not available */ }
}

function logSession(startedAt: string, endedAt: string, durationMinutes: number) {
  const id = crypto.randomUUID()
  const books = _activeSlug && _activeDirPath ? [{ slug: _activeSlug, dirPath: _activeDirPath }] : []
  invoke('log_study_session', { sessions: { id, startedAt, endedAt, durationMinutes, books } }).catch(() => {})
  if (_activeSlug && _activeDirPath) {
    invoke('increment_pomodoro_xp', { dirPath: _activeDirPath, slug: _activeSlug }).catch(() => {})
  }
}

function readConfig(): PomodoroConfig {
  try {
    const raw = localStorage.getItem('axiomatic:pomodoro-config')
    if (!raw) return { preset: '45/10', workMinutes: 45, breakMinutes: 10, audioEnabled: true, longBreakMultiplier: 3, longBreakInterval: 4 }
    return JSON.parse(raw)
  } catch {
    return { preset: '45/10', workMinutes: 45, breakMinutes: 10, audioEnabled: true, longBreakMultiplier: 3, longBreakInterval: 4 }
  }
}

function stopInterval() {
  if (_intervalId != null) {
    clearInterval(_intervalId)
    _intervalId = undefined
  }
}

function handlePhaseComplete(phase: Phase) {
  stopInterval()
  const cfg = readConfig()
  if (cfg.audioEnabled && _listeners.size > 0) playChime()

  if (phase === 'work') {
    const endedAt = new Date().toISOString()
    logSession(_state.sessionStart ?? endedAt, endedAt, cfg.workMinutes)
    const newCompleted = _state.completedPomodoros + 1
    const isLong = cfg.longBreakInterval > 0 && newCompleted % cfg.longBreakInterval === 0
    const breakDuration = isLong ? cfg.breakMinutes * cfg.longBreakMultiplier : cfg.breakMinutes
    _state = { ..._state, running: false, phase: 'break', secondsLeft: breakDuration * 60, completedPomodoros: newCompleted, showOverlay: true, isLongBreak: isLong, sessionStart: null }
  } else {
    const isLong = cfg.longBreakInterval > 0 && _state.completedPomodoros % cfg.longBreakInterval === 0
    _state = { ..._state, running: false, phase: 'work', secondsLeft: cfg.workMinutes * 60, completedPomodoros: isLong ? 0 : _state.completedPomodoros, sessionStart: null }
  }
  notify()
}

function tick() {
  if (_state.secondsLeft <= 1) {
    _state.secondsLeft = 0
    handlePhaseComplete(_state.phase)
    return
  }
  _state = { ..._state, secondsLeft: _state.secondsLeft - 1 }
  notify()
}

export function toggleTimer() {
  if (_state.running) {
    stopInterval()
    _state = { ..._state, running: false }
  } else {
    if (_state.phase === 'work' && !_state.sessionStart) {
      _state.sessionStart = new Date().toISOString()
    }
    _state = { ..._state, running: true }
    stopInterval()
    _intervalId = setInterval(tick, 1000)
  }
  notify()
}

export function resetTimer() {
  stopInterval()
  const cfg = readConfig()
  _state = { running: false, phase: 'work', secondsLeft: cfg.workMinutes * 60, completedPomodoros: 0, showOverlay: false, isLongBreak: false, sessionStart: null }
  notify()
}

export function skipPhase() {
  stopInterval()
  const cfg = readConfig()
  if (_state.phase === 'work') {
    const isLong = cfg.longBreakInterval > 0 && (_state.completedPomodoros + 1) % cfg.longBreakInterval === 0
    const breakDuration = isLong ? cfg.breakMinutes * cfg.longBreakMultiplier : cfg.breakMinutes
    _state = { ..._state, running: false, phase: 'break', secondsLeft: breakDuration * 60, completedPomodoros: _state.completedPomodoros + 1, isLongBreak: isLong, sessionStart: null }
  } else {
    _state = { ..._state, running: false, phase: 'work', secondsLeft: cfg.workMinutes * 60, sessionStart: null }
  }
  notify()
}

export function dismissOverlay() {
  _state = { ..._state, showOverlay: false, running: true }
  stopInterval()
  _intervalId = setInterval(tick, 1000)
  notify()
}

export function applyNewDuration(workMinutes: number) {
  if (!_state.running && _state.phase === 'work') {
    _state = { ..._state, secondsLeft: workMinutes * 60 }
    notify()
  }
}

export function resetToPreset(workMinutes: number) {
  stopInterval()
  _state = { running: false, phase: 'work', secondsLeft: workMinutes * 60, completedPomodoros: 0, showOverlay: false, isLongBreak: false, sessionStart: null }
  notify()
}

// Sync initial secondsLeft with persisted config
{
  const cfg = readConfig()
  _state.secondsLeft = cfg.workMinutes * 60
  _snapshot = { ..._state }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopInterval()
    _listeners.clear()
    _state = { running: false, phase: 'work', secondsLeft: 45 * 60, completedPomodoros: 0, showOverlay: false, isLongBreak: false, sessionStart: null }
    _snapshot = { ..._state }
  })
}

export function usePomodoroTimer(activeSlug?: string, activeDirPath?: string) {
  const timer = useSyncExternalStore(subscribe, getSnapshot)

  useEffect(() => {
    _activeSlug = activeSlug
    _activeDirPath = activeDirPath
  }, [activeSlug, activeDirPath])

  return timer
}
