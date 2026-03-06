import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import {
  usePomodoroConfig,
  savePomodoroConfig,
  applyPreset,
  type PomodoroPreset,
  type PomodoroConfig,
} from '../hooks/usePomodoroConfig'
import { BreakOverlay } from './BreakOverlay'

// ---------------------------------------------------------------------------
// Module-level timer state — survives route navigation, resets on app restart
// ---------------------------------------------------------------------------

type Phase = 'work' | 'break'

interface TimerState {
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
  secondsLeft: 25 * 60, // Will be synced with config on first render
  completedPomodoros: 0,
  showOverlay: false,
  isLongBreak: false,
  sessionStart: null,
}

let _snapshot = { ..._state }
let _intervalId: ReturnType<typeof setInterval> | undefined
const _listeners = new Set<() => void>()

// Track active book for session logging
let _activeSlug: string | undefined
let _activeDirPath: string | undefined

function notify() {
  _snapshot = { ..._state }
  _listeners.forEach((fn) => fn())
}

function subscribeTimer(fn: () => void): () => void {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}

function getTimerSnapshot(): TimerState {
  return _snapshot
}

/** Play an audio chime using Web Audio API */
function playChime() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = 660
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.8)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.type = 'sine'
    osc2.frequency.value = 880
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.3)
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.1)
    osc2.start(ctx.currentTime + 0.3)
    osc2.stop(ctx.currentTime + 1.1)
  } catch {
    // Audio not available
  }
}

function logSession(startedAt: string, endedAt: string, durationMinutes: number) {
  const id = crypto.randomUUID()
  const books =
    _activeSlug && _activeDirPath ? [{ slug: _activeSlug, dirPath: _activeDirPath }] : []
  invoke('log_study_session', {
    sessions: { id, startedAt, endedAt, durationMinutes, books },
  }).catch(() => {})
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

function handleWorkComplete() {
  stopInterval()
  const cfg = readConfig()
  const endedAt = new Date().toISOString()
  const startedAt = _state.sessionStart ?? endedAt
  logSession(startedAt, endedAt, cfg.workMinutes)

  if (cfg.audioEnabled) playChime()

  const newCompleted = _state.completedPomodoros + 1
  const isLong = cfg.longBreakInterval > 0 && newCompleted % cfg.longBreakInterval === 0
  const breakDuration = isLong ? cfg.breakMinutes * cfg.longBreakMultiplier : cfg.breakMinutes

  _state = {
    ..._state,
    running: false,
    phase: 'break',
    secondsLeft: breakDuration * 60,
    completedPomodoros: newCompleted,
    showOverlay: true,
    isLongBreak: isLong,
    sessionStart: null,
  }
  notify()
}

function handleBreakComplete() {
  stopInterval()
  const cfg = readConfig()
  if (cfg.audioEnabled) playChime()

  const isLong = cfg.longBreakInterval > 0 && _state.completedPomodoros % cfg.longBreakInterval === 0
  const resetCount = isLong ? 0 : _state.completedPomodoros

  _state = {
    ..._state,
    running: false,
    phase: 'work',
    secondsLeft: cfg.workMinutes * 60,
    completedPomodoros: resetCount,
    sessionStart: null,
  }
  notify()
}

function tick() {
  if (_state.secondsLeft <= 1) {
    _state.secondsLeft = 0
    if (_state.phase === 'work') {
      handleWorkComplete()
    } else {
      handleBreakComplete()
    }
    return
  }
  _state = { ..._state, secondsLeft: _state.secondsLeft - 1 }
  notify()
}

function startTimer() {
  if (_state.running) return
  if (_state.phase === 'work' && !_state.sessionStart) {
    _state.sessionStart = new Date().toISOString()
  }
  _state = { ..._state, running: true }
  stopInterval()
  _intervalId = setInterval(tick, 1000)
  notify()
}

function pauseTimer() {
  if (!_state.running) return
  stopInterval()
  _state = { ..._state, running: false }
  notify()
}

function toggleTimer() {
  if (_state.running) pauseTimer()
  else startTimer()
}

function resetTimer() {
  stopInterval()
  const cfg = readConfig()
  _state = {
    running: false,
    phase: 'work',
    secondsLeft: cfg.workMinutes * 60,
    completedPomodoros: 0,
    showOverlay: false,
    isLongBreak: false,
    sessionStart: null,
  }
  notify()
}

function skipPhase() {
  stopInterval()
  const cfg = readConfig()
  if (_state.phase === 'work') {
    const isLong = cfg.longBreakInterval > 0 && (_state.completedPomodoros + 1) % cfg.longBreakInterval === 0
    const breakDuration = isLong ? cfg.breakMinutes * cfg.longBreakMultiplier : cfg.breakMinutes
    _state = {
      ..._state,
      running: false,
      phase: 'break',
      secondsLeft: breakDuration * 60,
      completedPomodoros: _state.completedPomodoros + 1,
      isLongBreak: isLong,
      sessionStart: null,
    }
  } else {
    _state = {
      ..._state,
      running: false,
      phase: 'work',
      secondsLeft: cfg.workMinutes * 60,
      sessionStart: null,
    }
  }
  notify()
}

function dismissOverlay() {
  _state = { ..._state, showOverlay: false, running: true }
  stopInterval()
  _intervalId = setInterval(tick, 1000)
  notify()
}

function applyNewDuration(workMinutes: number) {
  // Only update if not running and in work phase
  if (!_state.running && _state.phase === 'work') {
    _state = { ..._state, secondsLeft: workMinutes * 60 }
    notify()
  }
}

function resetToPreset(workMinutes: number) {
  stopInterval()
  _state = {
    running: false,
    phase: 'work',
    secondsLeft: workMinutes * 60,
    completedPomodoros: 0,
    showOverlay: false,
    isLongBreak: false,
    sessionStart: null,
  }
  notify()
}

// Sync initial secondsLeft with persisted config
{
  const cfg = readConfig()
  _state.secondsLeft = cfg.workMinutes * 60
  _snapshot = { ..._state }
}

// HMR cleanup
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopInterval()
    _listeners.clear()
    _state = {
      running: false,
      phase: 'work',
      secondsLeft: 45 * 60,
      completedPomodoros: 0,
      showOverlay: false,
      isLongBreak: false,
      sessionStart: null,
    }
    _snapshot = { ..._state }
  })
}

// ---------------------------------------------------------------------------
// React component
// ---------------------------------------------------------------------------

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface Props {
  zenMode: boolean
  activeSlug?: string
  activeDirPath?: string
}

export function PomodoroTimer({ zenMode, activeSlug, activeDirPath }: Props) {
  const config = usePomodoroConfig()
  const timer = useSyncExternalStore(subscribeTimer, getTimerSnapshot)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [customWork, setCustomWork] = useState(String(config.workMinutes))
  const [customBreak, setCustomBreak] = useState(String(config.breakMinutes))
  const popoverRef = useRef<HTMLDivElement>(null)
  const settingsBtnRef = useRef<HTMLButtonElement>(null)

  // Keep module-level book tracking in sync with props
  useEffect(() => {
    _activeSlug = activeSlug
    _activeDirPath = activeDirPath
  }, [activeSlug, activeDirPath])

  // Sync custom input fields when config changes
  useEffect(() => {
    setCustomWork(String(config.workMinutes))
    setCustomBreak(String(config.breakMinutes))
  }, [config.workMinutes, config.breakMinutes])

  // When config changes and timer is idle in work phase, update duration
  useEffect(() => {
    applyNewDuration(config.workMinutes)
  }, [config.workMinutes])

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (popoverRef.current?.contains(target)) return
      if (settingsBtnRef.current?.contains(target)) return
      setPopoverOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [popoverOpen])

  const handlePresetChange = useCallback(
    (preset: PomodoroPreset) => {
      const next = applyPreset(preset, config)
      savePomodoroConfig(next)
      resetToPreset(next.workMinutes)
    },
    [config],
  )

  const handleCustomApply = useCallback(() => {
    const w = parseInt(customWork, 10)
    const b = parseInt(customBreak, 10)
    if (!w || w < 1 || !b || b < 1) return
    const next: PomodoroConfig = { ...config, preset: 'custom', workMinutes: w, breakMinutes: b }
    savePomodoroConfig(next)
    resetToPreset(w)
  }, [config, customWork, customBreak])

  const handleToggleAudio = useCallback(() => {
    savePomodoroConfig({ ...config, audioEnabled: !config.audioEnabled })
  }, [config])

  const breakDuration = timer.isLongBreak
    ? config.breakMinutes * config.longBreakMultiplier
    : config.breakMinutes

  const phaseColor =
    timer.phase === 'work'
      ? 'text-[#859900] dark:text-[#859900]'
      : 'text-[#268bd2] dark:text-[#268bd2]'

  return (
    <>
      <div style={zenMode ? { display: 'none' } : undefined} className="flex items-center gap-1">
        <div className="mx-0.5 h-4 w-px bg-[#eee8d5] dark:bg-[#073642]" />
        {/* Pomodoro count */}
        {config.longBreakInterval > 0 && (
          <span className="mr-0.5 text-xs tabular-nums text-[#93a1a1] dark:text-[#586e75]">
            {timer.completedPomodoros}/{config.longBreakInterval}
          </span>
        )}
        {/* Timer display */}
        <button
          onClick={toggleTimer}
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-sm tabular-nums hover:bg-[#eee8d5] dark:hover:bg-[#073642] ${phaseColor}`}
          aria-label={timer.running ? 'Pause timer' : 'Start timer'}
        >
          {timer.running ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
          <span>{formatTime(timer.secondsLeft)}</span>
          {(timer.running || timer.phase === 'break') && (
            <span className="text-[10px] uppercase tracking-wide opacity-40">
              {timer.phase === 'work' ? 'work' : 'break'}
            </span>
          )}
        </button>
        {/* Config button */}
        <div className="relative">
          <button
            ref={settingsBtnRef}
            onClick={() => setPopoverOpen((o) => !o)}
            className="shrink-0 rounded p-1 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
            aria-label="Timer settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2h12M6 22h12M7 2v4l5 6-5 6v4M17 2v4l-5 6 5 6v4" />
            </svg>
          </button>
        </div>
        {popoverOpen && createPortal(
          <div ref={popoverRef} className="fixed z-50 w-64 rounded-lg border border-[#eee8d5] bg-[#fdf6e3] p-3 shadow-lg dark:border-[#073642] dark:bg-[#002b36]" style={(() => { const r = settingsBtnRef.current?.getBoundingClientRect(); return r ? { top: r.bottom + 4, right: window.innerWidth - r.right } : { top: 40, right: 8 } })()}>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[#93a1a1] dark:text-[#657b83]">
                Duration
              </div>
              <div className="mb-3 flex gap-1">
                {(['45/10', '60/10', '90/15'] as PomodoroPreset[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => handlePresetChange(p)}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      config.preset === p
                        ? 'bg-[#268bd2] text-white'
                        : 'bg-[#eee8d5] text-[#586e75] hover:bg-[#ddd6c1] dark:bg-[#073642] dark:text-[#93a1a1] dark:hover:bg-[#0a4052]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => handlePresetChange('custom')}
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    config.preset === 'custom'
                      ? 'bg-[#268bd2] text-white'
                      : 'bg-[#eee8d5] text-[#586e75] hover:bg-[#ddd6c1] dark:bg-[#073642] dark:text-[#93a1a1] dark:hover:bg-[#0a4052]'
                  }`}
                >
                  Custom
                </button>
              </div>
              {config.preset === 'custom' && (
                <div className="mb-3 flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-[#586e75] dark:text-[#93a1a1]">
                    <span>Work</span>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={customWork}
                      onChange={(e) => setCustomWork(e.target.value)}
                      className="h-6 w-12 rounded border border-[#93a1a1]/30 bg-transparent px-1 text-center text-xs text-[#073642] outline-none focus:border-[#268bd2] dark:text-[#eee8d5]"
                    />
                  </label>
                  <label className="flex items-center gap-1 text-xs text-[#586e75] dark:text-[#93a1a1]">
                    <span>Break</span>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={customBreak}
                      onChange={(e) => setCustomBreak(e.target.value)}
                      className="h-6 w-12 rounded border border-[#93a1a1]/30 bg-transparent px-1 text-center text-xs text-[#073642] outline-none focus:border-[#268bd2] dark:text-[#eee8d5]"
                    />
                  </label>
                  <button
                    onClick={handleCustomApply}
                    className="rounded bg-[#268bd2] px-2 py-0.5 text-xs text-white hover:bg-[#268bd2]/90"
                  >
                    Set
                  </button>
                </div>
              )}
              <div className="mb-2 border-t border-[#eee8d5] pt-2 dark:border-[#073642]">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[#93a1a1] dark:text-[#657b83]">
                  Notifications
                </div>
                <div className="flex cursor-pointer items-center justify-between text-xs text-[#586e75] dark:text-[#93a1a1]">
                  <span>Audio chime</span>
                  <button
                    onClick={handleToggleAudio}
                    className={`shrink-0 relative h-5 w-9 rounded-full transition-colors ${
                      config.audioEnabled
                        ? 'bg-[#268bd2]'
                        : 'bg-[#93a1a1]/30 dark:bg-[#586e75]/40'
                    }`}
                    role="switch"
                    aria-checked={config.audioEnabled}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        config.audioEnabled ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
              <div className="border-t border-[#eee8d5] pt-2 dark:border-[#073642]">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[#93a1a1] dark:text-[#657b83]">
                  Timer
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={skipPhase}
                    className="flex-1 rounded px-2 py-1 text-xs text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
                  >
                    Skip
                  </button>
                  <button
                    onClick={resetTimer}
                    className="flex-1 rounded px-2 py-1 text-xs text-[#dc322f] hover:bg-[#dc322f]/10"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>,
          document.body,
        )}
      </div>
      {timer.showOverlay &&
        createPortal(
          <BreakOverlay
            isLongBreak={timer.isLongBreak}
            breakMinutes={breakDuration}
            onDismiss={dismissOverlay}
          />,
          document.body,
        )}
    </>
  )
}
