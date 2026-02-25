import React, { useCallback, useRef, useState } from 'react'

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

export function SnipOverlay({ pageNum, onRegion }: { pageNum: number; onRegion: (page: number, x: number, y: number, w: number, h: number) => void }) {
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const divRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startClientX = e.clientX
    const startClientY = e.clientY

    const toNorm = (ev: MouseEvent | React.MouseEvent) => {
      const bounds = divRef.current?.getBoundingClientRect()
      if (!bounds) return null
      return {
        startX: clamp01((startClientX - bounds.left) / bounds.width),
        startY: clamp01((startClientY - bounds.top) / bounds.height),
        endX: clamp01((ev.clientX - bounds.left) / bounds.width),
        endY: clamp01((ev.clientY - bounds.top) / bounds.height),
      }
    }

    const handleMove = (ev: MouseEvent) => {
      const n = toNorm(ev)
      if (!n) return
      setRect({
        x: Math.min(n.startX, n.endX),
        y: Math.min(n.startY, n.endY),
        w: Math.abs(n.endX - n.startX),
        h: Math.abs(n.endY - n.startY),
      })
    }

    const handleUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      const n = toNorm(ev)
      if (!n) { setRect(null); return }
      const x = Math.min(n.startX, n.endX)
      const y = Math.min(n.startY, n.endY)
      const w = Math.abs(n.endX - n.startX)
      const h = Math.abs(n.endY - n.startY)
      setRect(null)
      if (w > 0.01 && h > 0.01) {
        onRegion(pageNum, x, y, w, h)
      }
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [pageNum, onRegion])

  return (
    <div
      ref={divRef}
      className="absolute inset-0 cursor-crosshair"
      style={{ zIndex: 10 }}
      onMouseDown={handleMouseDown}
    >
      {rect && (
        <div
          className="pointer-events-none absolute border-2 border-dashed border-[#268bd2] bg-[#268bd2]/10"
          style={{
            left: `${rect.x * 100}%`,
            top: `${rect.y * 100}%`,
            width: `${rect.w * 100}%`,
            height: `${rect.h * 100}%`,
          }}
        />
      )}
    </div>
  )
}
