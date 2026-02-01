import { useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]

interface Props {
  title: string
  currentPage: number
  totalPages: number
  zoom: number
  onZoomChange: (zoom: number) => void
  notesOpen: boolean
  onToggleNotes: () => void
  searchOpen: boolean
  onToggleSearch: () => void
  searchQuery: string
  onSearchQueryChange: (q: string) => void
  searchCurrentIndex: number
  searchTotalMatches: number
  onSearchNext: () => void
  onSearchPrev: () => void
  savedProgressPage?: number | null
  onBackToProgress?: () => void
}

export function ReaderToolbar({
  title,
  currentPage,
  totalPages,
  zoom,
  onZoomChange,
  notesOpen,
  onToggleNotes,
  searchOpen,
  onToggleSearch,
  searchQuery,
  onSearchQueryChange,
  searchCurrentIndex,
  searchTotalMatches,
  onSearchNext,
  onSearchPrev,
  savedProgressPage,
  onBackToProgress,
}: Props) {
  const zoomIdx = ZOOM_STEPS.indexOf(zoom)
  const canZoomOut = zoomIdx > 0
  const canZoomIn = zoomIdx < ZOOM_STEPS.length - 1
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus()
    }
  }, [searchOpen])

  const iconBtnClass = 'shrink-0 rounded p-1.5 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]'
  const iconBtnActiveClass = 'shrink-0 rounded p-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'

  return (
    <div className="shrink-0">
      {searchOpen && (
        <div className="flex h-10 items-center gap-2 border-t border-[#eee8d5] bg-[#eee8d5] px-3 dark:border-[#073642] dark:bg-[#073642]">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (e.shiftKey) onSearchPrev()
                else onSearchNext()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onToggleSearch()
              }
            }}
            placeholder="Search in document…"
            className="h-7 w-64 rounded border border-[#93a1a1] bg-[#fdf6e3] px-2 text-sm text-[#073642] outline-none focus:border-blue-400 dark:border-[#073642] dark:bg-[#002b36] dark:text-[#eee8d5] dark:focus:border-[#268bd2]"
          />
          <span className="text-xs tabular-nums text-[#657b83] dark:text-[#93a1a1]">
            {searchTotalMatches > 0
              ? `${searchCurrentIndex + 1} of ${searchTotalMatches}`
              : searchQuery
                ? 'No matches'
                : ''}
          </span>
          <button
            onClick={onSearchPrev}
            disabled={searchTotalMatches === 0}
            className="rounded px-1.5 py-0.5 text-sm text-[#586e75] hover:bg-[#fdf6e3] disabled:opacity-30 dark:text-[#93a1a1] dark:hover:bg-[#002b36]"
            aria-label="Previous match"
          >
            ‹
          </button>
          <button
            onClick={onSearchNext}
            disabled={searchTotalMatches === 0}
            className="rounded px-1.5 py-0.5 text-sm text-[#586e75] hover:bg-[#fdf6e3] disabled:opacity-30 dark:text-[#93a1a1] dark:hover:bg-[#002b36]"
            aria-label="Next match"
          >
            ›
          </button>
          {savedProgressPage != null && (
            <button
              onClick={onBackToProgress}
              className="ml-auto rounded px-2 py-0.5 text-xs font-medium text-[#268bd2] hover:bg-[#268bd2]/10 dark:text-[#268bd2] dark:hover:bg-blue-900/30"
              aria-label="Back to current page"
            >
              Back to p.{savedProgressPage}
            </button>
          )}
          <button
            onClick={onToggleSearch}
            className={`${savedProgressPage == null ? 'ml-auto' : ''} rounded px-1.5 py-0.5 text-sm text-[#657b83] hover:bg-[#fdf6e3] dark:text-[#93a1a1] dark:hover:bg-[#002b36]`}
            aria-label="Close search"
          >
            ✕
          </button>
        </div>
      )}
      <footer className="flex h-10 shrink-0 items-center border-t border-[#eee8d5] bg-[#fdf6e3] px-3 dark:border-[#073642] dark:bg-[#002b36]">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Link
            to="/"
            className={iconBtnClass}
            aria-label="Back to library"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </Link>
          <button
            onClick={onToggleSearch}
            className={searchOpen ? iconBtnActiveClass : iconBtnClass}
            aria-label="Toggle search"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <button
            onClick={onToggleNotes}
            className={notesOpen ? iconBtnActiveClass : iconBtnClass}
            aria-label="Toggle notes"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
          <div className="mx-1 h-4 w-px bg-[#eee8d5] dark:bg-[#073642]" />
          <button
            onClick={() => canZoomOut && onZoomChange(ZOOM_STEPS[zoomIdx - 1])}
            disabled={!canZoomOut}
            className="rounded px-1.5 py-0.5 text-sm text-[#586e75] hover:bg-[#eee8d5] disabled:opacity-30 dark:text-[#93a1a1] dark:hover:bg-[#073642]"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            onClick={() => onZoomChange(1)}
            className="min-w-[3.5rem] rounded px-1 py-0.5 text-center text-sm tabular-nums text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
            aria-label="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => canZoomIn && onZoomChange(ZOOM_STEPS[zoomIdx + 1])}
            disabled={!canZoomIn}
            className="rounded px-1.5 py-0.5 text-sm text-[#586e75] hover:bg-[#eee8d5] disabled:opacity-30 dark:text-[#93a1a1] dark:hover:bg-[#073642]"
            aria-label="Zoom in"
          >
            +
          </button>
          <div className="mx-1 h-4 w-px bg-[#eee8d5] dark:bg-[#073642]" />
          <span className="text-sm tabular-nums text-[#657b83] dark:text-[#93a1a1]">
            {currentPage} / {totalPages}
          </span>
          <span className="ml-2 min-w-0 truncate text-xs text-[#93a1a1] dark:text-[#657b83]">
            {title}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1 pl-1">
          <ThemeToggle />
        </div>
      </footer>
    </div>
  )
}
