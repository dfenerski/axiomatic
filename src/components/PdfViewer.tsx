import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Document, Page } from 'react-pdf'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import type { SearchMatch } from '../hooks/useSearch'

const BASE_WIDTH = 800
const BASE_HEIGHT = 1056
const PAGE_GAP = 16
const BUFFER = 5

interface Props {
  file: string
  initialPage?: number
  zoom?: number
  onPageChange?: (page: number) => void
  onTotalPages?: (total: number) => void
  containerRef?: RefObject<HTMLDivElement | null>
  searchMatches?: SearchMatch[]
  currentMatchIndex?: number
  onPdfLoaded?: (pdf: PDFDocumentProxy) => void
  scrollRequest?: { page: number; seq: number } | null
}

export function PdfViewer({
  file,
  initialPage = 1,
  zoom = 1,
  onPageChange,
  onTotalPages,
  containerRef: externalContainerRef,
  searchMatches,
  currentMatchIndex,
  onPdfLoaded,
  scrollRequest,
}: Props) {
  const [numPages, setNumPages] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleRange, setVisibleRange] = useState({ start: 1, end: 1 })
  const [currentPage, setCurrentPage] = useState(initialPage)
  const trackingEnabled = useRef(false)
  const hasRestored = useRef(false)
  const rafId = useRef(0)

  const pageWidth = BASE_WIDTH * zoom
  const pageHeight = BASE_HEIGHT * zoom
  const pageStride = pageHeight + PAGE_GAP

  const prevStrideRef = useRef(pageStride)

  const handleLoadSuccess = useCallback(
    (pdf: PDFDocumentProxy) => {
      setNumPages(pdf.numPages)
      onTotalPages?.(pdf.numPages)
      onPdfLoaded?.(pdf)
    },
    [onTotalPages, onPdfLoaded],
  )

  const handleItemClick = useCallback(
    ({ pageIndex }: { pageIndex: number }) => {
      const container = containerRef.current
      if (!container) return
      container.scrollTop = pageIndex * pageStride
    },
    [pageStride],
  )

  // Scroll restoration — runs once when numPages first becomes non-zero
  useEffect(() => {
    if (numPages === 0 || hasRestored.current) return
    hasRestored.current = true

    const container = containerRef.current
    if (!container) return

    if (initialPage > 1) {
      container.scrollTop = (initialPage - 1) * pageStride
    }

    // Enable page tracking after the browser has
    // processed the programmatic scroll.
    requestAnimationFrame(() => {
      trackingEnabled.current = true
    })
  }, [numPages, initialPage, pageStride])

  // Adjust scroll position when zoom changes to stay on the same page
  useEffect(() => {
    const container = containerRef.current
    const prevStride = prevStrideRef.current
    prevStrideRef.current = pageStride
    if (!container || prevStride === pageStride) return
    const ratio = container.scrollTop / prevStride
    container.scrollTop = ratio * pageStride
  }, [pageStride])

  // Scroll-driven virtualization + page tracking
  useEffect(() => {
    const container = containerRef.current
    if (!container || numPages === 0) return

    const update = () => {
      const scrollTop = container.scrollTop
      const viewH = container.clientHeight

      const first = Math.floor(scrollTop / pageStride) + 1
      const last = Math.ceil((scrollTop + viewH) / pageStride)

      setVisibleRange({
        start: Math.max(1, first - BUFFER),
        end: Math.min(numPages, last + BUFFER),
      })

      if (trackingEnabled.current) {
        const centerY = scrollTop + viewH / 2
        const page = Math.min(
          numPages,
          Math.max(1, Math.floor(centerY / pageStride) + 1),
        )
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

    update() // initial calculation
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', onScroll)
      if (rafId.current) cancelAnimationFrame(rafId.current)
    }
  }, [numPages, pageStride])

  // Notify parent of page changes
  useEffect(() => {
    if (trackingEnabled.current) {
      onPageChange?.(currentPage)
    }
  }, [currentPage, onPageChange])

  // Scroll to target page (for search navigation)
  useEffect(() => {
    if (!scrollRequest || scrollRequest.page < 1) return
    const container = containerRef.current
    if (!container) return
    container.scrollTop = (scrollRequest.page - 1) * pageStride
  }, [scrollRequest, pageStride])

  // Search highlighting via CSS Custom Highlight API
  useEffect(() => {
    if (typeof CSS === 'undefined' || !CSS.highlights) return

    CSS.highlights.delete('search-highlight')
    CSS.highlights.delete('search-highlight-active')

    if (!searchMatches || searchMatches.length === 0) return

    const allRanges: Range[] = []
    let activeRange: Range | null = null

    for (let pageNum = visibleRange.start; pageNum <= visibleRange.end; pageNum++) {
      const pageMatches = searchMatches
        .map((m, i) => ({ ...m, globalIndex: i }))
        .filter((m) => m.page === pageNum)
      if (pageMatches.length === 0) continue

      const pageEl = containerRef.current?.querySelector(
        `[data-page-number="${pageNum}"] .textLayer`,
      )
      if (!pageEl) continue

      // Collect text nodes
      const walker = document.createTreeWalker(pageEl, NodeFilter.SHOW_TEXT)
      const textNodes: { node: Text; start: number; end: number }[] = []
      let offset = 0
      let node: Text | null
      while ((node = walker.nextNode() as Text | null)) {
        const len = node.textContent?.length ?? 0
        textNodes.push({ node, start: offset, end: offset + len })
        offset += len
      }

      for (const match of pageMatches) {
        const range = document.createRange()
        let rangeStartSet = false
        let remaining = match.charEnd - match.charStart

        for (const tn of textNodes) {
          if (tn.end <= match.charStart) continue
          if (tn.start >= match.charEnd) break

          const startInNode = Math.max(0, match.charStart - tn.start)
          const endInNode = Math.min(tn.end - tn.start, match.charEnd - tn.start)

          if (!rangeStartSet) {
            range.setStart(tn.node, startInNode)
            rangeStartSet = true
          }
          range.setEnd(tn.node, endInNode)
          remaining -= endInNode - startInNode
          if (remaining <= 0) break
        }

        if (rangeStartSet) {
          allRanges.push(range)
          if (match.globalIndex === currentMatchIndex) {
            activeRange = range
          }
        }
      }
    }

    if (allRanges.length > 0) {
      CSS.highlights.set('search-highlight', new Highlight(...allRanges))
    }
    if (activeRange) {
      CSS.highlights.set('search-highlight-active', new Highlight(activeRange))
    }
  }, [searchMatches, currentMatchIndex, visibleRange])

  const totalHeight = numPages > 0 ? numPages * pageStride - PAGE_GAP : 0

  return (
    <div ref={(node) => {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node
      if (externalContainerRef) {
        (externalContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = node
      }
    }} className="pdf-reader flex-1 overflow-y-auto bg-[#eee8d5] dark:bg-[#073642]">
      <Document
        file={file}
        onLoadSuccess={handleLoadSuccess}
        externalLinkTarget="_blank"
        onItemClick={handleItemClick}
        loading={
          <div className="flex items-center justify-center p-8 text-[#657b83] dark:text-[#93a1a1]">
            Loading PDF…
          </div>
        }
      >
        {numPages > 0 && (
          <div
            className="relative mx-auto"
            style={{ height: totalHeight, width: pageWidth }}
          >
            {Array.from(
              { length: visibleRange.end - visibleRange.start + 1 },
              (_, i) => {
                const pageNum = visibleRange.start + i
                const top = (pageNum - 1) * pageStride
                return (
                  <div
                    key={pageNum}
                    data-page-number={pageNum}
                    className="absolute left-0 shadow-md"
                    style={{ top, width: pageWidth, height: pageHeight }}
                  >
                    <Page
                      pageNumber={pageNum}
                      width={pageWidth}
                      renderAnnotationLayer={true}
                      renderTextLayer={true}
                      loading={
                        <div
                          className="flex items-center justify-center bg-[#fdf6e3] text-[#93a1a1] dark:bg-[#073642] dark:text-[#657b83]"
                          style={{ width: pageWidth, height: pageHeight }}
                        >
                          Page {pageNum}
                        </div>
                      }
                    />
                  </div>
                )
              },
            )}
          </div>
        )}
      </Document>
    </div>
  )
}
