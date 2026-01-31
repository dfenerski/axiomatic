import { useEffect, useRef, useState } from 'react'
import { Document, Page } from 'react-pdf'
import {
  getCachedThumbnail,
  setCachedThumbnail,
} from '../lib/thumbnail-cache'

interface Props {
  file: string
  onTotalPages?: (total: number) => void
}

export function PdfThumbnail({ file, onTotalPages }: Props) {
  const [cachedUrl, setCachedUrl] = useState<string | null>(null)
  const [cacheChecked, setCacheChecked] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const totalPagesRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    getCachedThumbnail(file).then((cached) => {
      if (cancelled) return
      if (cached) {
        setCachedUrl(cached.dataUrl)
        onTotalPages?.(cached.totalPages)
      }
      setCacheChecked(true)
    })
    return () => {
      cancelled = true
    }
    // Run once per file — onTotalPages identity may change but we
    // only need to call it once from cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  if (cachedUrl) {
    return (
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
        <img
          src={cachedUrl}
          alt=""
          className="h-full w-full object-contain"
        />
      </div>
    )
  }

  if (!cacheChecked) {
    return (
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
        <div className="absolute inset-0 animate-pulse bg-gray-300 dark:bg-gray-600" />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative aspect-[3/4] w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-700"
    >
      <Document
        file={file}
        loading={
          <div className="absolute inset-0 animate-pulse bg-gray-300 dark:bg-gray-600" />
        }
        onLoadSuccess={(pdf) => {
          totalPagesRef.current = pdf.numPages
          onTotalPages?.(pdf.numPages)
        }}
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
              const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
              setCachedThumbnail(file, {
                dataUrl,
                totalPages: totalPagesRef.current,
              })
            }
          }}
        />
      </Document>
    </div>
  )
}
