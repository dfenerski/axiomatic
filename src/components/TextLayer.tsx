import { memo } from 'react'
import type { PageTextLayer } from '../hooks/usePageTextLayer'

interface Props {
  textLayer: PageTextLayer
  pageHeight: number
}

export const TextLayer = memo(function TextLayer({ textLayer, pageHeight }: Props) {
  return (
    <div
      className="absolute inset-0"
      style={{ zIndex: 1 }}
    >
      {textLayer.spans.map((span, i) => {
        const heightPx = span.rect.height * pageHeight
        // fontSize roughly matches the span height to align with PDF text
        const fontSize = Math.max(4, heightPx * 0.85)

        return (
          <span
            key={i}
            data-span-index={i}
            style={{
              position: 'absolute',
              left: `${span.rect.x * 100}%`,
              top: `${span.rect.y * 100}%`,
              width: `${span.rect.width * 100}%`,
              height: `${span.rect.height * 100}%`,
              fontSize: `${fontSize}px`,
              lineHeight: `${heightPx}px`,
              color: 'transparent',
              whiteSpace: 'pre',
              userSelect: 'text',
              WebkitUserSelect: 'text',
            }}
          >
            {span.text}
          </span>
        )
      })}
    </div>
  )
})
