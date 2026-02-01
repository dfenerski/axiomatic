import { useEffect, useRef, useState } from 'react'
import { subscribeProgress } from '../lib/load-queue'
import type { SyncPhase } from '../hooks/useSyncStatus'

interface SyncStatusProps {
  phase: SyncPhase
  label: string
  bookCount: number
}

function Checkmark() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ProgressBar({ progress, indeterminate }: { progress: number; indeterminate: boolean }) {
  return (
    <div className="w-16 h-1 rounded-full bg-[#eee8d5] dark:bg-[#073642]">
      <div
        className={`h-1 rounded-full bg-[#93a1a1] dark:bg-[#586e75] transition-all duration-300 ${indeterminate ? 'animate-pulse' : ''}`}
        style={{ width: indeterminate ? '30%' : `${progress * 100}%` }}
      />
    </div>
  )
}

export function SyncStatus({ phase, label, bookCount }: SyncStatusProps) {
  const [visible, setVisible] = useState(true)
  const [faded, setFaded] = useState(false)
  const fadeTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const unmountTimer = useRef<ReturnType<typeof setTimeout>>(null)

  // Subscribe to queue progress directly so OverviewPage doesn't re-render
  const [fraction, setFraction] = useState(0)
  useEffect(
    () =>
      subscribeProgress((s) => {
        setFraction((prev) => {
          const next = s.total > 0 ? s.completed / s.total : 0
          return prev === next ? prev : next
        })
      }),
    [],
  )

  useEffect(() => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current)
    if (unmountTimer.current) clearTimeout(unmountTimer.current)

    if (phase === 'done') {
      setVisible(true)
      setFaded(false)
      fadeTimer.current = setTimeout(() => setFaded(true), 2000)
      unmountTimer.current = setTimeout(() => setVisible(false), 2500)
    } else {
      setVisible(true)
      setFaded(false)
    }

    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current)
      if (unmountTimer.current) clearTimeout(unmountTimer.current)
    }
  }, [phase])

  if (bookCount === 0 || !visible) return null

  const isDone = phase === 'done'
  const indeterminate = phase === 'scanning' || phase === 'rendering'
  const progress = phase === 'loading' ? fraction : phase === 'done' ? 1 : 0

  return (
    <span
      className={`ml-auto flex items-center gap-1.5 text-xs text-[#93a1a1] transition-opacity duration-500 dark:text-[#586e75] ${faded ? 'opacity-0' : 'opacity-100'}`}
    >
      {isDone ? <Checkmark /> : <ProgressBar progress={progress} indeterminate={indeterminate} />}
      {label}
    </span>
  )
}
