import { useEffect, useState } from 'react'
import { subscribeProgress } from '../lib/load-queue'

export type SyncPhase = 'scanning' | 'rendering' | 'loading' | 'done'

export interface SyncStatusResult {
  phase: SyncPhase
  label: string
  bookCount: number
}

export function useSyncStatus(
  loading: boolean,
  totalItems: number,
  renderLimit: number,
): SyncStatusResult {
  const [queueIdle, setQueueIdle] = useState(true)

  useEffect(
    () =>
      subscribeProgress((s) => {
        setQueueIdle((prev) => (prev === s.idle ? prev : s.idle))
      }),
    [],
  )

  let phase: SyncPhase
  if (loading) {
    phase = 'scanning'
  } else if (renderLimit < totalItems) {
    phase = 'rendering'
  } else if (!queueIdle) {
    phase = 'loading'
  } else {
    phase = 'done'
  }

  const label =
    phase === 'scanning'
      ? 'Scanning\u2026'
      : `${totalItems} book${totalItems === 1 ? '' : 's'}`

  return { phase, label, bookCount: totalItems }
}
