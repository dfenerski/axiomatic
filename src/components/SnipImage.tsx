import { useEffect, useRef } from 'react'
import type { Snip } from '../hooks/useSnips'
import { buildPdfiumUrl } from '../lib/pdfium-url'
import { getPlatformInfo } from '../lib/platform'

/**
 * Resolve the actual path for a snip. If the stored full_path doesn't match
 * any textbook (e.g. snip created on a different device), fall back to
 * matching by filename against the provided path map.
 */
function resolveSnipPath(snip: Snip, pathMap?: Map<string, string>): string {
  if (!pathMap) return snip.full_path
  // Try exact match first
  if (pathMap.has(snip.full_path)) return snip.full_path
  // Fall back to filename match
  const fileName = snip.full_path.split('/').pop() ?? snip.full_path.split('\\').pop() ?? ''
  for (const [, fullPath] of pathMap) {
    if (fullPath.endsWith('/' + fileName) || fullPath.endsWith('\\' + fileName)) {
      return fullPath
    }
  }
  return snip.full_path
}

export function SnipImage({ snip, className, onSize, pathMap }: { snip: Snip; className?: string; onSize?: (w: number, h: number) => void; pathMap?: Map<string, string> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const resolvedPath = resolveSnipPath(snip, pathMap)
    const url = buildPdfiumUrl({ path: resolvedPath, page: snip.page, width: 800, dpr: 2 }, getPlatformInfo().os)
    const img = new Image()
    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const sx = Math.round(snip.x * img.naturalWidth)
      const sy = Math.round(snip.y * img.naturalHeight)
      const sw = Math.round(snip.width * img.naturalWidth)
      const sh = Math.round(snip.height * img.naturalHeight)
      canvas.width = sw
      canvas.height = sh
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
      onSize?.(sw, sh)
    }
    img.src = url
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onSize is a stable callback from the parent; including it would re-fetch the image on every render
  }, [snip])

  return (
    <canvas
      ref={canvasRef}
      className={className ?? 'mt-4 max-h-[60vh] max-w-full rounded border border-[#eee8d5] object-contain dark:border-[#073642]'}
    />
  )
}
