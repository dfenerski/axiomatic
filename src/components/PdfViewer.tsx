import { useCallback, useEffect, useRef, useState } from 'react'
import { Document, Page } from 'react-pdf'

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
}

export function PdfViewer({
  file,
  initialPage = 1,
  zoom = 1,
  onPageChange,
  onTotalPages,
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
    (pdf: { numPages: number }) => {
      setNumPages(pdf.numPages)
      onTotalPages?.(pdf.numPages)
    },
    [onTotalPages],
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

  const totalHeight = numPages > 0 ? numPages * pageStride - PAGE_GAP : 0

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto bg-gray-100">
      <Document
        file={file}
        onLoadSuccess={handleLoadSuccess}
        loading={
          <div className="flex items-center justify-center p-8 text-gray-500">
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
                      renderAnnotationLayer={false}
                      renderTextLayer={false}
                      loading={
                        <div
                          className="flex items-center justify-center bg-white text-gray-400"
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
