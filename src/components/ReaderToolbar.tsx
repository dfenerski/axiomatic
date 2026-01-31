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

  return (
    <div className="shrink-0">
      <div className="flex h-12 items-center gap-4 border-b border-[#eee8d5] bg-[#fdf6e3] px-4 dark:border-[#073642] dark:bg-[#002b36]">
        <Link
          to="/"
          className="rounded px-2 py-1 text-sm font-medium text-[#586e75] hover:bg-[#eee8d5] hover:text-[#073642] dark:text-[#93a1a1] dark:hover:bg-[#073642] dark:hover:text-[#eee8d5]"
        >
          &larr; Back
        </Link>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#073642] dark:text-[#eee8d5]">
          {title}
        </span>
        <div className="flex shrink-0 items-center gap-1">
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
          <span className="ml-3 text-sm tabular-nums text-[#657b83] dark:text-[#93a1a1]">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={onToggleSearch}
            className={`ml-3 rounded px-2 py-0.5 text-sm font-medium ${
              searchOpen
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                : 'text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]'
            }`}
            aria-label="Toggle search"
          >
            Search
          </button>
          <button
            onClick={onToggleNotes}
            className={`ml-1 rounded px-2 py-0.5 text-sm font-medium ${
              notesOpen
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                : 'text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]'
            }`}
            aria-label="Toggle notes"
          >
            Notes
          </button>
          <ThemeToggle />
        </div>
      </div>
      {searchOpen && (
        <div className="flex h-10 items-center gap-2 border-b border-[#eee8d5] bg-[#eee8d5] px-4 dark:border-[#073642] dark:bg-[#073642]">
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
            className="h-7 w-64 rounded border border-[#93a1a1] bg-[#fdf6e3] px-2 text-sm text-[#073642] outline-none focus:border-blue-400 dark:border-[#073642] dark:bg-[#073642] dark:text-[#eee8d5] dark:focus:border-[#268bd2]"
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
            className="rounded px-1.5 py-0.5 text-sm text-[#586e75] hover:bg-[#eee8d5] disabled:opacity-30 dark:text-[#93a1a1] dark:hover:bg-[#073642]"
            aria-label="Previous match"
          >
            ‹
          </button>
          <button
            onClick={onSearchNext}
            disabled={searchTotalMatches === 0}
            className="rounded px-1.5 py-0.5 text-sm text-[#586e75] hover:bg-[#eee8d5] disabled:opacity-30 dark:text-[#93a1a1] dark:hover:bg-[#073642]"
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
            className={`${savedProgressPage == null ? 'ml-auto' : ''} rounded px-1.5 py-0.5 text-sm text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]`}
            aria-label="Close search"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
