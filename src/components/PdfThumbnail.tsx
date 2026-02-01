import { useEffect, useRef, useState } from 'react'
import { Document, Page } from 'react-pdf'
import {
  getCachedThumbnail,
  setCachedThumbnail,
} from '../lib/thumbnail-cache'
import { enqueue } from '../lib/load-queue'

interface Props {
  file: string
  fullPath?: string
  cacheKey?: string
  onTotalPages?: (total: number) => void
}

const SKELETON = (
  <div className="relative aspect-[3/4] w-full overflow-hidden rounded bg-[#eee8d5] dark:bg-[#073642]">
    <div className="absolute inset-0 animate-pulse bg-[#93a1a1] dark:bg-[#073642]" />
  </div>
)

export function PdfThumbnail({ file, fullPath, cacheKey, onTotalPages }: Props) {
  const key = cacheKey ?? file
  const [visible, setVisible] = useState(false)
  const [cachedUrl, setCachedUrl] = useState<string | null>(null)
  const [cacheChecked, setCacheChecked] = useState(false)
  const [ready, setReady] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const totalPagesRef = useRef(0)
  const resolveRender = useRef<(() => void) | null>(null)

  // Observe visibility — once in viewport (with 200px margin), start loading
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Check cache only once visible
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    getCachedThumbnail(key).then((cached) => {
      if (cancelled) return
      if (cached && cached.dataUrl.length > 200) {
        setCachedUrl(cached.dataUrl)
        onTotalPages?.(cached.totalPages)
      }
      setCacheChecked(true)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, visible])

  // Acquire a queue slot, then set ready so <Document> mounts with the asset URL.
  // The queue slot is held until the Page render completes (or fails/unmounts),
  // so only MAX_CONCURRENT PDFs are parsed by pdfjs-dist at once.
  // This avoids readFile entirely — pdfjs-dist's worker fetches the asset URL
  // directly, keeping large binary data off the main thread.
  useEffect(() => {
    if (cachedUrl || !cacheChecked || !fullPath) return
    let cancelled = false
    enqueue(
      () =>
        new Promise<void>((resolve) => {
          if (cancelled) {
            resolve()
            return
          }
          resolveRender.current = resolve
          setReady(true)
        }),
    )
    return () => {
      cancelled = true
      // Release queue slot if component unmounts before render completes
      if (resolveRender.current) {
        resolveRender.current()
        resolveRender.current = null
      }
    }
  }, [cachedUrl, cacheChecked, fullPath])

  // Release queue slot helper — called on render success or error
  const releaseSlot = () => {
    if (resolveRender.current) {
      resolveRender.current()
      resolveRender.current = null
    }
  }

  if (!visible) {
    return (
      <div ref={sentinelRef} className="relative aspect-[3/4] w-full overflow-hidden rounded bg-[#eee8d5] dark:bg-[#073642]" />
    )
  }

  if (cachedUrl) {
    return (
      <div ref={sentinelRef} className="relative aspect-[3/4] w-full overflow-hidden rounded bg-[#eee8d5] dark:bg-[#073642]">
        <img
          src={cachedUrl}
          alt=""
          className="h-full w-full object-contain"
        />
      </div>
    )
  }

  if (!cacheChecked || !ready) {
    return (
      <div ref={sentinelRef} className="relative aspect-[3/4] w-full overflow-hidden rounded bg-[#eee8d5] dark:bg-[#073642]">
        <div className="absolute inset-0 animate-pulse bg-[#93a1a1] dark:bg-[#073642]" />
      </div>
    )
  }

  return (
    <div
      ref={(el) => {
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        (sentinelRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }}
      className="relative aspect-[3/4] w-full overflow-hidden rounded bg-[#eee8d5] dark:bg-[#073642]"
    >
      <Document
        file={file}
        loading={SKELETON}
        onLoadSuccess={(pdf) => {
          totalPagesRef.current = pdf.numPages
          onTotalPages?.(pdf.numPages)
        }}
        onLoadError={releaseSlot}
      >
        <Page
          pageNumber={1}
          width={200}
          renderAnnotationLayer={false}
          renderTextLayer={false}
          onRenderSuccess={() => {
            const canvas =
              containerRef.current?.querySelector('canvas')
            if (canvas && totalPagesRef.current > 0) {
              try {
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
                if (dataUrl.length > 200) {
                  setCachedThumbnail(key, {
                    dataUrl,
                    totalPages: totalPagesRef.current,
                  })
                }
              } catch {
                // Canvas tainted — skip caching, live render is fine
              }
            }
            releaseSlot()
          }}
          onRenderError={releaseSlot}
        />
      </Document>
    </div>
  )
}
