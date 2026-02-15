import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useImperativeHandle, startTransition } from 'react'
import type { RefObject } from 'react'
import type { DocumentInfo } from '../hooks/useDocument'
import { usePageLinks, type LinkAnnotation } from '../hooks/usePageLinks'
import { usePageTextLayer, type PageTextLayer } from '../hooks/usePageTextLayer'
import type { Highlight } from '../hooks/useHighlights'
import { TextLayer } from './TextLayer'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'

const BASE_WIDTH = 800
const PAGE_GAP = 16
const BUFFER = 3

const HIGHLIGHT_COLORS = [
  { label: 'Yellow', color: '#b58900' },
  { label: 'Orange', color: '#cb4b16' },
  { label: 'Blue', color: '#268bd2' },
  { label: 'Green', color: '#859900' },
]

export interface PdfViewerHandle {
  applyZoom: (zoom: number) => void
}

interface Props {
  docInfo: DocumentInfo
  fullPath: string
  initialPage?: number
  onPageChange?: (page: number) => void
  containerRef?: RefObject<HTMLDivElement | null>
  scrollRequest?: { page: number; seq: number } | null
  highlightsForPage?: (page: number) => Highlight[]
  onDeleteHighlight?: (id: number) => void
  onDeleteHighlightGroup?: (groupId: string) => void
  onCreateHighlight?: (
    page: number,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    note: string,
    text: string,
    groupId: string,
  ) => Promise<unknown>
}

interface ContextMenuState {
  x: number
  y: number
  type: 'selection' | 'highlight' | 'page'
  pageNum?: number
  highlightId?: number
  highlightGroupId?: string
}

/** Binary search: find which page (1-indexed) contains the given scroll offset. */
function pageAtOffset(offsets: number[], scrollTop: number): number {
  let lo = 0
  let hi = offsets.length - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (offsets[mid] <= scrollTop) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

function generateId(): string {
  return crypto.randomUUID()
}

const PdfViewerInner = React.forwardRef<PdfViewerHandle, Props>(function PdfViewerInner({
  docInfo,
  fullPath,
  initialPage = 1,
  onPageChange,
  containerRef: externalContainerRef,
  scrollRequest,
  highlightsForPage,
  onDeleteHighlight,
  onDeleteHighlightGroup,
  onCreateHighlight,
}, ref) {
  const numPages = docInfo.page_count
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleRange, setVisibleRange] = useState({ start: 1, end: 1 })
  const [currentPage, setCurrentPage] = useState(initialPage)
  const trackingEnabled = useRef(false)
  const hasRestored = useRef(false)
  const rafId = useRef(0)
  const { getLinks } = usePageLinks(fullPath)
  const { getTextLayer, getCachedTextLayer } = usePageTextLayer(fullPath)
  const [pageLinks, setPageLinks] = useState<Map<number, LinkAnnotation[]>>(
    new Map(),
  )
  const [pageTextLayers, setPageTextLayers] = useState<Map<number, PageTextLayer>>(
    new Map(),
  )
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [clipStartPage, setClipStartPage] = useState<number | null>(null)
  const visibleRangeRef = useRef({ start: 1, end: 1 })

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1

  // committedZoom controls layout + image rendering.
  // Intermediate zoom ticks are handled imperatively via applyZoom (no re-render).
  const [committedZoom, setCommittedZoom] = useState(1)
  const committedZoomRef = useRef(1)
  const currentZoomRef = useRef(1)
  const scaleRef = useRef(1)
  const spacerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const prevVisualHeightRef = useRef(0)
  const commitTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const prerenderSeqRef = useRef(0)

  const layoutWidth = BASE_WIDTH * committedZoom

  // Pre-compute cumulative page offsets from committed zoom dimensions.
  const pageOffsets = useMemo(() => {
    const offsets: number[] = [0]
    let cumulative = 0
    for (const page of docInfo.pages) {
      const height = layoutWidth / page.aspect_ratio
      cumulative += height + PAGE_GAP
      offsets.push(cumulative)
    }
    return offsets
  }, [docInfo.pages, layoutWidth])

  const totalHeight = pageOffsets[numPages] - PAGE_GAP
  const totalHeightRef = useRef(totalHeight)
  totalHeightRef.current = totalHeight

  // Expose imperative applyZoom — called directly, no React re-render.
  useImperativeHandle(ref, () => ({
    applyZoom: (newZoom: number) => {
      currentZoomRef.current = newZoom
      const th = totalHeightRef.current
      const sf = newZoom / committedZoomRef.current
      scaleRef.current = sf

      if (contentRef.current) {
        contentRef.current.style.transform = sf !== 1 ? `scale(${sf})` : ''
      }
      const newVH = th * sf
      if (spacerRef.current) {
        spacerRef.current.style.height = `${newVH}px`
      }

      // Adjust scroll to keep center stable
      const prev = prevVisualHeightRef.current
      prevVisualHeightRef.current = newVH
      if (prev > 0 && prev !== newVH && trackingEnabled.current) {
        const container = containerRef.current
        if (container) {
          const viewH = container.clientHeight
          const oldCenter = container.scrollTop + viewH / 2
          container.scrollTop = oldCenter * (newVH / prev) - viewH / 2
        }
      }

      // Debounce committedZoom update — pre-render pages at target width
      // so all pdfium:// img loads hit the shared cache (zero main-thread blocking)
      clearTimeout(commitTimerRef.current)
      commitTimerRef.current = setTimeout(async () => {
        const seq = ++prerenderSeqRef.current
        const targetWidth = Math.round(BASE_WIDTH * newZoom)
        const range = visibleRangeRef.current
        const pagesToRender: number[] = []
        for (let p = range.start; p <= range.end; p++) {
          pagesToRender.push(p)
        }
        try {
          await invoke('prerender_pages', {
            path: fullPath,
            pages: pagesToRender,
            width: targetWidth,
            dpr,
          })
        } catch {
          // Render thread may have preempted — still commit
        }
        if (seq !== prerenderSeqRef.current) return
        committedZoomRef.current = newZoom
        startTransition(() => setCommittedZoom(newZoom))
      }, 300)
    },
  }), [])

  // After committedZoom catches up, sync transform state
  useLayoutEffect(() => {
    committedZoomRef.current = committedZoom
    const sf = currentZoomRef.current / committedZoom
    scaleRef.current = sf
    const newVH = totalHeight * sf
    if (contentRef.current) {
      contentRef.current.style.transform = sf !== 1 ? `scale(${sf})` : ''
    }
    if (spacerRef.current) {
      spacerRef.current.style.height = `${newVH}px`
    }
    prevVisualHeightRef.current = newVH
  }, [committedZoom, totalHeight])

  // Scroll restoration — runs once after component mounts with doc info
  useEffect(() => {
    if (numPages === 0 || hasRestored.current) return
    hasRestored.current = true

    const container = containerRef.current
    if (!container) return

    if (initialPage > 1 && initialPage <= numPages) {
      container.scrollTop = pageOffsets[initialPage - 1] * scaleRef.current
    }

    requestAnimationFrame(() => {
      trackingEnabled.current = true
    })
  }, [numPages, initialPage, pageOffsets])

  // Scroll-driven virtualization + page tracking
  useEffect(() => {
    const container = containerRef.current
    if (!container || numPages === 0) return

    const update = () => {
      const sf = scaleRef.current
      const scrollTop = container.scrollTop / sf
      const viewH = container.clientHeight / sf

      const first = pageAtOffset(pageOffsets, scrollTop)
      const last = pageAtOffset(pageOffsets, scrollTop + viewH)

      setVisibleRange((prev) => {
        const newStart = Math.max(1, first - BUFFER)
        const newEnd = Math.min(numPages, last + BUFFER)
        if (prev.start === newStart && prev.end === newEnd) return prev
        const next = { start: newStart, end: newEnd }
        visibleRangeRef.current = next
        return next
      })

      if (trackingEnabled.current) {
        const centerY = scrollTop + viewH / 2
        const page = pageAtOffset(pageOffsets, centerY)
        setCurrentPage(page)
      }
    }

    const onScroll = () => {
      if (rafId.current) return
      rafId.current = requestAnimationFrame(() => {
        rafId.current = 0
        update()
      })
    }

    update()
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', onScroll)
      if (rafId.current) cancelAnimationFrame(rafId.current)
    }
  }, [numPages, pageOffsets])

  // Notify parent of page changes
  useEffect(() => {
    if (trackingEnabled.current) {
      onPageChange?.(currentPage)
    }
  }, [currentPage, onPageChange])

  // Scroll to target page (search navigation)
  useEffect(() => {
    if (!scrollRequest || scrollRequest.page < 1) return
    const container = containerRef.current
    if (!container) return
    const targetPage = Math.min(scrollRequest.page, numPages)
    container.scrollTop = pageOffsets[targetPage - 1] * scaleRef.current
  }, [scrollRequest, pageOffsets, numPages])

  // Track which pages have been fetched so the effect doesn't re-fetch.
  // This ref persists across effect re-runs, preventing the O(n²) cascade
  // that occurred when pageLinks/pageTextLayers Maps were in the deps.
  const fetchedPagesRef = useRef<Set<number>>(new Set())

  // Lazily fetch link annotations and text layers for visible pages.
  // Delayed so initial page image renders aren't blocked on the
  // single render thread by text-layer / link IPC calls.
  useEffect(() => {
    // Determine which pages actually need fetching (skip already-fetched)
    const pagesToFetch: number[] = []
    for (let pageNum = visibleRange.start; pageNum <= visibleRange.end; pageNum++) {
      if (!fetchedPagesRef.current.has(pageNum)) {
        pagesToFetch.push(pageNum)
      }
    }
    if (pagesToFetch.length === 0) return

    let cancelled = false
    const timer = setTimeout(async () => {
      const newLinks: [number, LinkAnnotation[]][] = []
      const newTextLayers: [number, PageTextLayer][] = []

      for (const pageNum of pagesToFetch) {
        if (cancelled) return

        const links = await getLinks(pageNum)
        if (cancelled) return
        if (links.length > 0) {
          newLinks.push([pageNum, links])
        }

        const textLayer = await getTextLayer(pageNum)
        if (cancelled) return
        if (textLayer && textLayer.spans.length > 0) {
          newTextLayers.push([pageNum, textLayer])
        }

        // Mark as fetched only after both succeeded
        fetchedPagesRef.current.add(pageNum)
      }

      // Batch state updates — single re-render instead of one per page
      if (newLinks.length > 0) {
        setPageLinks((prev) => {
          const merged = new Map(prev)
          for (const [k, v] of newLinks) merged.set(k, v)
          return merged
        })
      }
      if (newTextLayers.length > 0) {
        setPageTextLayers((prev) => {
          const merged = new Map(prev)
          for (const [k, v] of newTextLayers) merged.set(k, v)
          return merged
        })
      }
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [visibleRange, getLinks, getTextLayer])

  const handleLinkClick = useCallback(
    (link: LinkAnnotation) => {
      if (link.link_type.type === 'internal') {
        const container = containerRef.current
        if (container) {
          const targetPage = Math.min(link.link_type.page, numPages)
          container.scrollTop = pageOffsets[targetPage - 1] * scaleRef.current
        }
      } else {
        invoke('open_url', { url: link.link_type.url }).catch(() => {})
      }
    },
    [numPages, pageOffsets],
  )

  // Close context menu on click elsewhere or scroll
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [contextMenu])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, pageNum: number) => {
      const sel = window.getSelection()
      if (sel && sel.toString().trim().length > 0 && onCreateHighlight) {
        e.preventDefault()
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          type: 'selection',
          pageNum,
        })
        return
      }

      // Check if right-clicking on an existing highlight
      const pageHighlights = highlightsForPage?.(pageNum)
      if (pageHighlights && pageHighlights.length > 0) {
        const pageEl = (e.target as HTMLElement).closest('[data-page-number]')
        if (pageEl) {
          const rect = pageEl.getBoundingClientRect()
          const clickX = (e.clientX - rect.left) / rect.width
          const clickY = (e.clientY - rect.top) / rect.height
          for (const hl of pageHighlights) {
            if (
              clickX >= hl.x &&
              clickX <= hl.x + hl.width &&
              clickY >= hl.y &&
              clickY <= hl.y + hl.height
            ) {
              e.preventDefault()
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                type: 'highlight',
                highlightId: hl.id,
                highlightGroupId: hl.group_id,
              })
              return
            }
          }
        }
      }

      // No selection and no highlight hit — offer page-level bookmark
      if (onCreateHighlight) {
        e.preventDefault()
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          type: 'page',
          pageNum,
        })
      }
    },
    [highlightsForPage, onCreateHighlight],
  )

  const handleHighlightColor = useCallback(
    async (color: string) => {
      if (!contextMenu || contextMenu.type !== 'selection' || !contextMenu.pageNum || !onCreateHighlight) return
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return

      const selectedText = sel.toString().trim()
      if (!selectedText) return

      const pageNum = contextMenu.pageNum
      const textLayer = getCachedTextLayer(pageNum)
      if (!textLayer) return

      // Collect char_rects from selected spans
      const range = sel.getRangeAt(0)
      const pageEl = containerRef.current?.querySelector(`[data-page-number="${pageNum}"]`)
      if (!pageEl) return

      // Find all text spans within the selection
      const selectedRects: { x: number; y: number; width: number; height: number; lineY: number }[] = []

      const spanElements = pageEl.querySelectorAll('[data-span-index]')
      for (const spanEl of spanElements) {
        if (!range.intersectsNode(spanEl)) continue
        const spanIndex = parseInt(spanEl.getAttribute('data-span-index')!, 10)
        const span = textLayer.spans[spanIndex]
        if (!span) continue

        // Determine which characters are selected within this span
        const spanText = span.text
        let startOffset = 0
        let endOffset = spanText.length

        if (spanEl === range.startContainer || spanEl.contains(range.startContainer)) {
          startOffset = range.startContainer === spanEl.firstChild
            ? range.startOffset
            : 0
        }
        if (spanEl === range.endContainer || spanEl.contains(range.endContainer)) {
          endOffset = range.endContainer === spanEl.firstChild
            ? range.endOffset
            : spanText.length
        }

        // Get char rects for the selected range
        for (let ci = startOffset; ci < endOffset && ci < span.char_rects.length; ci++) {
          const cr = span.char_rects[ci]
          selectedRects.push({
            x: cr.x,
            y: cr.y,
            width: cr.width,
            height: cr.height,
            lineY: cr.y,
          })
        }
      }

      if (selectedRects.length === 0) return

      // Group rects by line (Y-proximity)
      const lines: typeof selectedRects[] = []
      let currentLine: typeof selectedRects = [selectedRects[0]]
      for (let i = 1; i < selectedRects.length; i++) {
        const r = selectedRects[i]
        const lastInLine = currentLine[currentLine.length - 1]
        // Same line if Y difference is small
        if (Math.abs(r.lineY - lastInLine.lineY) < lastInLine.height * 0.5) {
          currentLine.push(r)
        } else {
          lines.push(currentLine)
          currentLine = [r]
        }
      }
      lines.push(currentLine)

      // Create merged rects per line
      const groupId = generateId()
      for (const line of lines) {
        const minX = Math.min(...line.map((r) => r.x))
        const minY = Math.min(...line.map((r) => r.y))
        const maxX = Math.max(...line.map((r) => r.x + r.width))
        const maxY = Math.max(...line.map((r) => r.y + r.height))
        await onCreateHighlight(
          pageNum,
          minX,
          minY,
          maxX - minX,
          maxY - minY,
          color,
          '',
          selectedText,
          groupId,
        )
      }

      sel.removeAllRanges()
      setContextMenu(null)
    },
    [contextMenu, onCreateHighlight, getCachedTextLayer],
  )

  const handlePageBookmark = useCallback(async () => {
    if (!contextMenu || contextMenu.type !== 'page' || !contextMenu.pageNum || !onCreateHighlight) return
    await onCreateHighlight(contextMenu.pageNum, 0, 0, 0, 0, 'bookmark', '', `Page ${contextMenu.pageNum}`, '')
    setContextMenu(null)
  }, [contextMenu, onCreateHighlight])

  const handleDeleteFromMenu = useCallback(() => {
    if (!contextMenu || contextMenu.type !== 'highlight') return
    if (contextMenu.highlightGroupId) {
      onDeleteHighlightGroup?.(contextMenu.highlightGroupId)
    } else if (contextMenu.highlightId != null) {
      onDeleteHighlight?.(contextMenu.highlightId)
    }
    setContextMenu(null)
  }, [contextMenu, onDeleteHighlight, onDeleteHighlightGroup])

  const handleClipStart = useCallback((pageNum: number) => {
    setClipStartPage(pageNum)
    setContextMenu(null)
  }, [])

  const handleClipEnd = useCallback(async (pageNum: number) => {
    if (clipStartPage == null) return
    setContextMenu(null)
    try {
      const outputPath = await save({
        defaultPath: `clip_p${clipStartPage}-${pageNum}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (!outputPath) return
      await invoke('clip_pdf', {
        sourcePath: fullPath,
        startPage: clipStartPage,
        endPage: pageNum,
        outputPath,
      })
    } catch (e) {
      console.error('clip_pdf failed:', e)
    }
    setClipStartPage(null)
  }, [clipStartPage, fullPath])

  const handleClipCancel = useCallback(() => {
    setClipStartPage(null)
    setContextMenu(null)
  }, [])

  const encodedPath = encodeURIComponent(fullPath)

  // Memoize page list — stable during zoom (all deps are committedZoom-based)
  const pages = useMemo(
    () =>
      Array.from(
        { length: visibleRange.end - visibleRange.start + 1 },
        (_, i) => {
          const pageNum = visibleRange.start + i
          const top = pageOffsets[pageNum - 1]
          const pageHeight =
            pageOffsets[pageNum] - pageOffsets[pageNum - 1] - PAGE_GAP
          const links = pageLinks.get(pageNum)
          const pageHighlights = highlightsForPage?.(pageNum)
          const textLayer = pageTextLayers.get(pageNum)

          const isClipStart = clipStartPage === pageNum
          const inClipRange = clipStartPage != null && pageNum >= clipStartPage

          return (
            <div
              key={pageNum}
              data-page-number={pageNum}
              className="absolute left-0 shadow-md"
              style={{
                top,
                width: layoutWidth,
                height: pageHeight,
                ...(isClipStart ? { borderTop: '3px solid #268bd2' } : inClipRange ? { borderTop: '2px solid #268bd2', opacity: 0.85 } : {}),
              }}
              onContextMenu={(e) => handleContextMenu(e, pageNum)}
            >
              <img
                src={`pdfium://localhost/render?path=${encodedPath}&page=${pageNum}&width=${Math.round(layoutWidth)}&dpr=${dpr}`}
                alt={`Page ${pageNum}`}
                className="pdf-page-img block h-full w-full"
                draggable={false}
                style={{ position: 'relative', zIndex: 0 }}
              />
              {textLayer && (
                <TextLayer
                  textLayer={textLayer}
                  pageHeight={pageHeight}
                />
              )}
              {pageHighlights &&
                pageHighlights
                  .filter((hl) => hl.color !== 'bookmark')
                  .map((hl) => (
                    <div
                      key={`hl-${hl.id}`}
                      className="absolute pointer-events-none"
                      style={{
                        left: `${hl.x * 100}%`,
                        top: `${hl.y * 100}%`,
                        width: `${hl.width * 100}%`,
                        height: `${hl.height * 100}%`,
                        backgroundColor: hl.color,
                        opacity: 0.3,
                        zIndex: 2,
                      }}
                    />
                  ))}
              {links &&
                links.map((link, li) => (
                  <div
                    key={li}
                    className="absolute cursor-pointer hover:bg-[#268bd2]/20"
                    style={{
                      left: `${link.rect.x * 100}%`,
                      top: `${link.rect.y * 100}%`,
                      width: `${link.rect.width * 100}%`,
                      height: `${link.rect.height * 100}%`,
                      zIndex: 3,
                    }}
                    onClick={() => handleLinkClick(link)}
                  />
                ))}
            </div>
          )
        },
      ),
    [visibleRange, layoutWidth, pageOffsets, encodedPath, dpr, pageLinks, pageTextLayers, highlightsForPage, handleContextMenu, handleLinkClick, clipStartPage],
  )

  return (
    <div
      ref={(node) => {
        ;(
          containerRef as React.MutableRefObject<HTMLDivElement | null>
        ).current = node
        if (externalContainerRef) {
          ;(
            externalContainerRef as React.MutableRefObject<HTMLDivElement | null>
          ).current = node
        }
      }}
      className="pdf-reader flex-1 overflow-y-auto bg-[#eee8d5] dark:bg-[#073642]"
    >
      {numPages > 0 && (
        <div ref={spacerRef}>
          <div
            ref={contentRef}
            className="relative mx-auto"
            style={{
              height: totalHeight,
              width: layoutWidth,
              transformOrigin: 'top center',
            }}
          >
            {pages}
          </div>
        </div>
      )}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded border border-[#93a1a1]/30 bg-[#fdf6e3] py-1 shadow-lg dark:border-[#586e75]/30 dark:bg-[#002b36]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'selection' && (
            <>
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
                onClick={() => handleHighlightColor('bookmark')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
                Bookmark
              </button>
              {HIGHLIGHT_COLORS.map((hc) => (
                <button
                  key={hc.color}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
                  onClick={() => handleHighlightColor(hc.color)}
                >
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: hc.color }}
                  />
                  Highlight {hc.label}
                </button>
              ))}
            </>
          )}
          {contextMenu.type === 'page' && (
            <>
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
                onClick={handlePageBookmark}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
                Bookmark page
              </button>
              <div className="my-1 h-px bg-[#eee8d5] dark:bg-[#073642]" />
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
                onClick={() => handleClipStart(contextMenu.pageNum!)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                </svg>
                Mark clip start
              </button>
              {clipStartPage != null && contextMenu.pageNum! > clipStartPage && (
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
                  onClick={() => handleClipEnd(contextMenu.pageNum!)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  </svg>
                  Mark clip end (pages {clipStartPage}–{contextMenu.pageNum})
                </button>
              )}
              {clipStartPage != null && (
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[#dc322f] hover:bg-[#eee8d5] dark:hover:bg-[#073642]"
                  onClick={handleClipCancel}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  Cancel clip
                </button>
              )}
            </>
          )}
          {contextMenu.type === 'highlight' && (
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[#dc322f] hover:bg-[#eee8d5] dark:hover:bg-[#073642]"
              onClick={handleDeleteFromMenu}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
              Delete highlight
            </button>
          )}
        </div>
      )}
    </div>
  )
})

export const PdfViewer = React.memo(PdfViewerInner)
