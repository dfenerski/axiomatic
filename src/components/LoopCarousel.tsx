import { useCallback, useEffect, useRef, useState } from 'react'
import type { Snip } from '../hooks/useSnips'
import { ZoomableSnipImage } from './ZoomableSnipImage'

interface LoopCarouselProps {
  snips: Snip[]
  xp: number
  onIncrementXp: () => Promise<number>
  onExit: () => void
  shuffled: boolean
  /** Optional per-snip XP increment for cross-book loops. When provided, this
   *  is called instead of onIncrementXp so that XP is credited to the correct
   *  directory + slug combination. */
  onIncrementXpForSnip?: (dirPath: string, slug: string) => Promise<void>
  /** When true: images always revealed, no XP tracking */
  viewMode?: boolean
  /** Start at this index instead of 0 */
  initialIndex?: number
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function LoopCarousel({
  snips,
  xp,
  onIncrementXp,
  onExit,
  shuffled,
  onIncrementXpForSnip,
  viewMode,
  initialIndex,
}: LoopCarouselProps) {
  // Stabilize order: only compute once when snips first arrive (avoids
  // re-shuffling mid-session if the snips array reference changes).
  const [orderedSnips, setOrderedSnips] = useState<Snip[]>([])
  const snipsInitializedRef = useRef(false)
  useEffect(() => {
    if (snips.length > 0 && !snipsInitializedRef.current) {
      snipsInitializedRef.current = true
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: one-time initialization on first data arrival
      setOrderedSnips(shuffled ? shuffle(snips) : [...snips])
    }
  }, [snips, shuffled])

  const [index, setIndex] = useState(initialIndex ?? 0)
  const [revealed, setRevealed] = useState(viewMode === true)
  const [displayXp, setDisplayXp] = useState(xp)

  const current = orderedSnips[index]

  const handleReveal = useCallback(() => {
    if (revealed) return
    setRevealed(true)
  }, [revealed])

  const advance = useCallback(async (snip: Snip) => {
    if (viewMode) return
    if (onIncrementXpForSnip) {
      const withDir = snip as Snip & { dirPath?: string }
      if (withDir.dirPath) {
        await onIncrementXpForSnip(withDir.dirPath, snip.slug)
      }
    } else {
      const newXp = await onIncrementXp()
      if (newXp != null) setDisplayXp(newXp)
    }
  }, [onIncrementXp, onIncrementXpForSnip, viewMode])

  const handleNext = useCallback(() => {
    const currentSnip = orderedSnips[index]
    setIndex((i) => (i + 1) % orderedSnips.length)
    if (!viewMode) setRevealed(false)
    if (currentSnip) advance(currentSnip)
  }, [orderedSnips, index, advance, viewMode])

  const handlePrev = useCallback(() => {
    setIndex((i) => (i - 1 + orderedSnips.length) % orderedSnips.length)
    if (!viewMode) setRevealed(false)
  }, [orderedSnips.length, viewMode])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          setRevealed((r) => !r)
          break
        case 'j':
        case 'ArrowRight':
          e.preventDefault()
          handleNext()
          break
        case 'k':
        case 'ArrowLeft':
          e.preventDefault()
          handlePrev()
          break
        case 'Escape':
          e.preventDefault()
          onExit()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNext, handlePrev, onExit])

  if (!current) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#fdf6e3] dark:bg-[#002b36]">
        <p className="text-[#657b83] dark:text-[#93a1a1]">No snips to review.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-[#fdf6e3] p-8 dark:bg-[#002b36]">
      {/* Header */}
      <div className="flex w-full max-w-2xl items-center justify-between">
        <span className="text-sm text-[#93a1a1] dark:text-[#586e75]">
          {index + 1} / {orderedSnips.length}
        </span>
        {!viewMode && !onIncrementXpForSnip && (
          <span className="text-sm font-medium text-[#b58900]">
            {displayXp} XP
          </span>
        )}
        <button
          onClick={onExit}
          className="text-sm text-[#93a1a1] hover:text-[#657b83] dark:text-[#586e75] dark:hover:text-[#93a1a1]"
        >
          ESC to exit
        </button>
      </div>

      {/* Card */}
      <div className={`flex w-full flex-col items-center gap-4 rounded-lg border border-[#eee8d5] bg-white p-8 shadow-sm dark:border-[#073642] dark:bg-[#073642] ${revealed ? 'max-w-[90vw]' : 'max-w-2xl'}`}>
        <h2 className="text-center text-2xl font-semibold text-[#657b83] dark:text-[#93a1a1]">
          {current.label}
        </h2>
        <p className="text-sm text-[#93a1a1] dark:text-[#586e75]">
          p. {current.page}
        </p>

        {revealed ? (
          <ZoomableSnipImage snip={current} maxHeight="80vh" globalShortcuts />
        ) : (
          <button
            onClick={handleReveal}
            className="mt-4 rounded-lg bg-[#268bd2] px-8 py-3 text-lg text-white transition-colors hover:bg-[#268bd2]/90"
          >
            Reveal
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-4">
        <button
          onClick={handlePrev}
          className="rounded px-4 py-2 text-sm text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
        >
          Prev (k)
        </button>
        <button
          onClick={handleNext}
          className="rounded px-4 py-2 text-sm text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
        >
          Next (j)
        </button>
      </div>
    </div>
  )
}
