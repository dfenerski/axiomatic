import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import type { Snip } from '../hooks/useSnips'
import { useNotes, useNoteContent } from '../hooks/useNotes'
import { NotesPanel } from './NotesPanel'
import { ZoomableSnipImage } from './ZoomableSnipImage'
import { useSwipe } from '../hooks/useSwipe'
import { usePlatform } from '../lib/platform'

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
  /** When true: no XP counter displayed, no XP increment on advance */
  noXp?: boolean
  /** Start at this index instead of 0 */
  initialIndex?: number
  /** Map for cross-device snip path resolution */
  pathMap?: Map<string, string>
  /** Library directory path for cross-device resolution */
  dirPath?: string
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
  noXp,
  initialIndex,
  pathMap,
  dirPath,
}: LoopCarouselProps) {
  const [notesOpen, setNotesOpen] = useState(false)
  const editorRef = useRef<EditorView | null>(null)
  const cardAreaRef = useRef<HTMLDivElement>(null)
  const { ensureNote, setNote } = useNotes()
  const platform = usePlatform()

  const [isShuffled, setIsShuffled] = useState(shuffled)

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
  const noteContent = useNoteContent(current?.slug, current?.page ?? 0)

  useEffect(() => {
    if (current) ensureNote(current.slug, current.page)
  }, [current?.slug, current?.page, ensureNote])

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
    if (isShuffled && index === orderedSnips.length - 1) {
      // Completed a full loop in shuffle mode: re-shuffle for the next pass
      setOrderedSnips(shuffle(snips))
      setIndex(0)
    } else {
      setIndex((i) => (i + 1) % orderedSnips.length)
    }
    if (!viewMode) setRevealed(false)
    if (currentSnip) advance(currentSnip)
  }, [orderedSnips, index, isShuffled, snips, advance, viewMode])

  const handlePrev = useCallback(() => {
    setIndex((i) => (i - 1 + orderedSnips.length) % orderedSnips.length)
    if (!viewMode) setRevealed(false)
  }, [orderedSnips.length, viewMode])

  const handleToggleShuffle = useCallback(() => {
    const next = !isShuffled
    setIsShuffled(next)
    setOrderedSnips(next ? shuffle(snips) : [...snips])
    setIndex(0)
    setRevealed(viewMode === true)
  }, [isShuffled, snips, viewMode])

  const swipeHandlers = useMemo(() => ({
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrev,
    onTap: handleReveal,
  }), [handleNext, handlePrev, handleReveal])
  useSwipe(cardAreaRef, swipeHandlers)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+L: toggle notes panel
      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault()
        setNotesOpen((v) => {
          if (!v) {
            setTimeout(() => editorRef.current?.focus(), 50)
          }
          return !v
        })
        return
      }

      // Ctrl+H: close notes if in editor, else exit carousel
      if (e.ctrlKey && e.key === 'h') {
        e.preventDefault()
        const el = document.activeElement
        if (el?.closest('.cm-editor')) {
          ;(el as HTMLElement).blur()
          setNotesOpen(false)
        } else {
          onExit()
        }
        return
      }

      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.closest('.cm-editor'))) return

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
    <div className="flex flex-1">
      <div ref={cardAreaRef} className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto bg-[#fdf6e3] p-4 sm:justify-center sm:gap-6 sm:p-8 dark:bg-[#002b36]">
        {/* Header */}
        <div className="flex w-full max-w-full items-center justify-between sm:max-w-2xl">
          <span className="text-sm text-[#93a1a1] dark:text-[#586e75]">
            {index + 1} / {orderedSnips.length}
          </span>
          <div className="flex items-center gap-3">
            {!viewMode && (
              <button
                onClick={handleToggleShuffle}
                aria-label="Toggle shuffle"
                title={isShuffled ? 'Shuffled — click to sort' : 'Sorted — click to shuffle'}
                className={`transition-colors ${isShuffled ? 'text-[#268bd2]' : 'text-[#93a1a1] dark:text-[#586e75]'} hover:text-[#268bd2]`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 3 21 3 21 8" />
                  <line x1="4" y1="20" x2="21" y2="3" />
                  <polyline points="21 16 21 21 16 21" />
                  <line x1="15" y1="15" x2="21" y2="21" />
                </svg>
              </button>
            )}
            {!viewMode && !noXp && !onIncrementXpForSnip && (
              <span className="text-sm font-medium text-[#b58900]">
                {displayXp} XP
              </span>
            )}
          </div>
          <button
            onClick={onExit}
            className="min-h-[44px] min-w-[44px] text-sm text-[#93a1a1] hover:text-[#657b83] dark:text-[#586e75] dark:hover:text-[#93a1a1]"
            aria-label="Exit carousel"
          >
            {platform.isMobile ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            ) : (
              'ESC to exit'
            )}
          </button>
        </div>

        {/* Card */}
        <div className={`flex w-full flex-col items-center gap-4 overflow-hidden rounded-lg border border-[#eee8d5] bg-white p-4 shadow-sm sm:p-8 dark:border-[#073642] dark:bg-[#073642] ${revealed ? 'max-w-full' : 'max-w-full sm:max-w-2xl'}`}>
          <h2 className="text-center text-2xl font-semibold text-[#657b83] dark:text-[#93a1a1]">
            {current.label}
          </h2>
          <p className="text-sm text-[#93a1a1] dark:text-[#586e75]">
            p. {current.page}
          </p>

          {revealed ? (
            <ZoomableSnipImage snip={current} maxHeight="60vh" globalShortcuts pathMap={pathMap} dirPath={dirPath} />
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
            aria-label="Previous"
            className="min-h-[44px] min-w-[44px] rounded px-4 py-2 text-sm text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
          >
            {platform.isMobile ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            ) : (
              'Prev (k)'
            )}
          </button>
          <button
            onClick={handleNext}
            aria-label="Next"
            className="min-h-[44px] min-w-[44px] rounded px-4 py-2 text-sm text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
          >
            {platform.isMobile ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            ) : (
              'Next (j)'
            )}
          </button>
        </div>
      </div>

      {notesOpen && current && (
        <NotesPanel
          slug={current.slug}
          page={current.page}
          content={noteContent}
          onUpdate={setNote}
          externalEditorRef={editorRef}
        />
      )}
    </div>
  )
}
