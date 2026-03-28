import { invoke } from '@tauri-apps/api/core'
import { memo, useEffect, useRef, useState } from 'react'
import { acquireSlot } from '../lib/thumbnail-queue'
import { buildPdfiumUrl } from '../lib/pdfium-url'
import { getPlatformInfo } from '../lib/platform'

interface Props {
  fullPath: string
}

export const PdfThumbnail = memo(function PdfThumbnail({ fullPath }: Props) {
  const [visible, setVisible] = useState(false)
  const [cached, setCached] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

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

  // Acquire slot → prerender off main thread → release slot → show <img>
  useEffect(() => {
    if (!visible) return
    let cancelled = false

    acquireSlot().then((release) => {
      if (cancelled) {
        release()
        return
      }
      invoke('prerender_pages', { path: fullPath, pages: [1], width: 200, dpr: 1 })
        .then(() => {
          if (!cancelled) setCached(true)
        })
        .catch(() => {
          // prerender failed — still show <img> so protocol handler can try
          if (!cancelled) setCached(true)
        })
        .finally(() => release())
    })

    return () => {
      cancelled = true
    }
  }, [visible, fullPath])

  if (!visible || !cached) {
    return (
      <div ref={sentinelRef} className="relative aspect-[3/4] w-full overflow-hidden rounded bg-[#eee8d5] dark:bg-[#073642]">
        {visible && (
          <div className="absolute inset-0 animate-pulse bg-[#93a1a1]/20 dark:bg-[#586e75]/20" />
        )}
      </div>
    )
  }

  return (
    <div ref={sentinelRef} className="relative aspect-[3/4] w-full overflow-hidden rounded bg-[#eee8d5] dark:bg-[#073642]">
      <img
        src={buildPdfiumUrl({ path: fullPath, page: 1, width: 200, dpr: 1 }, getPlatformInfo().os)}
        alt=""
        className="h-full w-full object-contain"
        draggable={false}
      />
    </div>
  )
}, (prev, next) =>
  prev.fullPath === next.fullPath)
