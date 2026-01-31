import { useEffect, useRef, useState } from 'react'
import { readFile } from '@tauri-apps/plugin-fs'
import { Document, Page } from 'react-pdf'
import {
  getCachedThumbnail,
  setCachedThumbnail,
} from '../lib/thumbnail-cache'

interface Props {
  file: string
  fullPath?: string
  cacheKey?: string
  onTotalPages?: (total: number) => void
}

export function PdfThumbnail({ file, fullPath, cacheKey, onTotalPages }: Props) {
  const key = cacheKey ?? file
  const [cachedUrl, setCachedUrl] = useState<string | null>(null)
  const [cacheChecked, setCacheChecked] = useState(false)
  const [pdfData, setPdfData] = useState<{ data: Uint8Array } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const totalPagesRef = useRef(0)

  useEffect(() => {
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
  }, [key])

  // Load PDF bytes via Tauri FS plugin to avoid cross-origin canvas tainting
  useEffect(() => {
    if (cachedUrl || !cacheChecked || !fullPath) return
    let cancelled = false
    readFile(fullPath).then((bytes) => {
      if (cancelled) return
      setPdfData({ data: bytes })
    }).catch((err) => {
      console.error('Failed to read PDF:', fullPath, err)
    })
    return () => { cancelled = true }
  }, [cachedUrl, cacheChecked, fullPath])

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

  if (!cacheChecked || (!pdfData && fullPath)) {
    return (
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
        <div className="absolute inset-0 animate-pulse bg-gray-300 dark:bg-gray-600" />
      </div>
    )
  }

  const fileSource = pdfData ?? file

  return (
    <div
      ref={containerRef}
      className="relative aspect-[3/4] w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-700"
    >
      <Document
        file={fileSource}
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
          }}
        />
      </Document>
    </div>
  )
}
