import { Link } from 'react-router-dom'

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]

interface Props {
  title: string
  currentPage: number
  totalPages: number
  zoom: number
  onZoomChange: (zoom: number) => void
  notesOpen: boolean
  onToggleNotes: () => void
}

export function ReaderToolbar({
  title,
  currentPage,
  totalPages,
  zoom,
  onZoomChange,
  notesOpen,
  onToggleNotes,
}: Props) {
  const zoomIdx = ZOOM_STEPS.indexOf(zoom)
  const canZoomOut = zoomIdx > 0
  const canZoomIn = zoomIdx < ZOOM_STEPS.length - 1

  return (
    <div className="flex h-12 shrink-0 items-center gap-4 border-b border-gray-200 bg-white px-4">
      <Link
        to="/"
        className="rounded px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-black"
      >
        &larr; Back
      </Link>
      <span className="truncate text-sm font-medium text-gray-800">
        {title}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => canZoomOut && onZoomChange(ZOOM_STEPS[zoomIdx - 1])}
          disabled={!canZoomOut}
          className="rounded px-1.5 py-0.5 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          onClick={() => onZoomChange(1)}
          className="min-w-[3.5rem] rounded px-1 py-0.5 text-center text-sm tabular-nums text-gray-600 hover:bg-gray-100"
          aria-label="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => canZoomIn && onZoomChange(ZOOM_STEPS[zoomIdx + 1])}
          disabled={!canZoomIn}
          className="rounded px-1.5 py-0.5 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30"
          aria-label="Zoom in"
        >
          +
        </button>
        <span className="ml-3 text-sm tabular-nums text-gray-500">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={onToggleNotes}
          className={`ml-3 rounded px-2 py-0.5 text-sm font-medium ${
            notesOpen
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
          aria-label="Toggle notes"
        >
          Notes
        </button>
      </div>
    </div>
  )
}
