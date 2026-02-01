import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export function useVimOverview(
  slugs: string[],
  gridRef: React.RefObject<HTMLDivElement | null>,
  sectionSizes: number[],
) {
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const columnsRef = useRef(1)
  const navigate = useNavigate()

  // Detect column count from grid computed style
  const updateColumns = useCallback(() => {
    const el = gridRef.current
    if (!el) return
    const cols = getComputedStyle(el).gridTemplateColumns.split(' ').length
    columnsRef.current = cols
  }, [gridRef])

  useEffect(() => {
    const el = gridRef.current
    if (!el) return

    updateColumns()

    const observer = new ResizeObserver(() => updateColumns())
    observer.observe(el)
    return () => observer.disconnect()
  }, [gridRef, updateColumns, slugs])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      const cols = columnsRef.current
      const count = slugs.length
      if (count === 0) return

      // Build cumulative boundaries from sectionSizes
      const boundaries: number[] = []
      let cum = 0
      for (const size of sectionSizes) {
        if (size > 0) {
          boundaries.push(cum)
          cum += size
        }
      }

      // Helper: given a flat index, return the section start, size, and local offset
      const section = (idx: number) => {
        for (let i = boundaries.length - 1; i >= 0; i--) {
          if (idx >= boundaries[i]) {
            const start = boundaries[i]
            const end = i + 1 < boundaries.length ? boundaries[i + 1] : count
            return { start, size: end - start, local: idx - start, sectionIdx: i }
          }
        }
        return { start: 0, size: count, local: idx, sectionIdx: 0 }
      }

      switch (e.key) {
        case 'j': {
          e.preventDefault()
          setSelectedIndex((prev) => {
            if (prev === -1) return 0

            const sec = section(prev)
            const localRow = Math.floor(sec.local / cols)
            const col = sec.local % cols
            const lastRow = Math.floor((sec.size - 1) / cols)

            if (localRow < lastRow) {
              // Move down within the same section
              const next = sec.start + (localRow + 1) * cols + col
              return next < sec.start + sec.size ? next : sec.start + sec.size - 1
            }

            // At the last row of this section — try crossing to the next
            if (sec.sectionIdx + 1 < boundaries.length) {
              const nextStart = boundaries[sec.sectionIdx + 1]
              const target = nextStart + col
              return target < count ? target : count - 1
            }

            return prev
          })
          break
        }
        case 'k': {
          e.preventDefault()
          setSelectedIndex((prev) => {
            if (prev <= 0) return prev

            const sec = section(prev)
            const localRow = Math.floor(sec.local / cols)
            const col = sec.local % cols

            if (localRow > 0) {
              // Move up within the same section
              return sec.start + (localRow - 1) * cols + col
            }

            // At the first row of this section — try crossing to the previous
            if (sec.sectionIdx > 0) {
              const prevStart = boundaries[sec.sectionIdx - 1]
              const prevEnd = boundaries[sec.sectionIdx]
              const prevSize = prevEnd - prevStart
              const lastPrevRow = Math.floor((prevSize - 1) / cols)
              const target = prevStart + lastPrevRow * cols + col
              return target < prevEnd ? target : prevEnd - 1
            }

            return prev
          })
          break
        }
        case 'h': {
          e.preventDefault()
          setSelectedIndex((prev) => {
            if (prev <= 0) return prev
            const sec = section(prev)
            const localRowStart = Math.floor(sec.local / cols) * cols
            return sec.local > localRowStart ? prev - 1 : prev
          })
          break
        }
        case 'l': {
          e.preventDefault()
          setSelectedIndex((prev) => {
            if (prev === -1) return 0
            const sec = section(prev)
            const localRowEnd = Math.floor(sec.local / cols) * cols + cols - 1
            const next = prev + 1
            return sec.local < localRowEnd && next < sec.start + sec.size ? next : prev
          })
          break
        }
        case 'Enter': {
          if (selectedIndex >= 0 && selectedIndex < count) {
            e.preventDefault()
            navigate(`/read/${slugs[selectedIndex]}`)
          }
          break
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [slugs, sectionSizes, selectedIndex, navigate])

  return { selectedIndex }
}
