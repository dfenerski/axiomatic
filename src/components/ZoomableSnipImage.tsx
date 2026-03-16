import { useCallback, useEffect, useState } from 'react'
import type { Snip } from '../hooks/useSnips'
import { SnipImage } from './SnipImage'

const ZOOM_STEP = 0.25
const ZOOM_MIN = 0.5
const ZOOM_MAX = 3

interface Props {
  snip: Snip
  /** Max height for the scrollable viewport */
  maxHeight?: string
  /** Whether to bind Ctrl+=/- and Ctrl+wheel globally (only one instance should) */
  globalShortcuts?: boolean
}

export function ZoomableSnipImage({ snip, maxHeight = '60vh', globalShortcuts = false }: Props) {
  const [zoom, setZoom] = useState(1)
  const [contentSize, setContentSize] = useState<{ w: number; h: number } | null>(null)

  // Reset zoom on snip change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset derived state when snip changes
    setZoom(1)
     
    setContentSize(null)
  }, [snip.id])

  // Called by SnipImage after canvas dimensions are set from the loaded image
  const handleSize = useCallback((w: number, h: number) => {
    setContentSize((prev) =>
      prev && prev.w === w && prev.h === h ? prev : { w, h },
    )
  }, [])

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN))
  }, [])

  const handleZoomReset = useCallback(() => {
    setZoom(1)
  }, [])

  // Global keyboard shortcuts (Ctrl+=/Ctrl+-/Ctrl+0)
  useEffect(() => {
    if (!globalShortcuts) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        handleZoomIn()
      } else if (e.key === '-') {
        e.preventDefault()
        handleZoomOut()
      } else if (e.key === '0') {
        e.preventDefault()
        handleZoomReset()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [globalShortcuts, handleZoomIn, handleZoomOut, handleZoomReset])

  // Global Ctrl+wheel zoom
  useEffect(() => {
    if (!globalShortcuts) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      if (e.deltaY < 0) handleZoomIn()
      else handleZoomOut()
    }
    window.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => window.removeEventListener('wheel', onWheel, { capture: true })
  }, [globalShortcuts, handleZoomIn, handleZoomOut])

  return (
    <div className="flex flex-col gap-2">
      <div
        className="overflow-auto"
        style={contentSize ? {
          maxWidth: '100%',
          maxHeight,
          width: contentSize.w * zoom,
          height: contentSize.h * zoom,
        } : undefined}
      >
        <div
          data-testid="snip-zoom-container"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
        >
          <SnipImage snip={snip} className="rounded border border-[#eee8d5] dark:border-[#073642]" onSize={handleSize} />
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={handleZoomOut}
          aria-label="Zoom out"
          className="rounded p-1 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
        <button
          onClick={handleZoomReset}
          aria-label="Reset zoom"
          className="rounded px-1 py-0.5 text-[10px] tabular-nums text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={handleZoomIn}
          aria-label="Zoom in"
          className="rounded p-1 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
      </div>
    </div>
  )
}
