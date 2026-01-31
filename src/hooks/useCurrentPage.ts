import { useEffect, useRef, useState } from 'react'

export function useCurrentPage(
  containerRef: React.RefObject<HTMLDivElement | null>,
  pageCount: number,
) {
  const [currentPage, setCurrentPage] = useState(1)
  const ratios = useRef<Map<number, number>>(new Map())

  useEffect(() => {
    const container = containerRef.current
    if (!container || pageCount === 0) return

    ratios.current.clear()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement
          const pageNum = Number(el.dataset.pageNumber)
          if (!isNaN(pageNum)) {
            ratios.current.set(pageNum, entry.intersectionRatio)
          }
        }
        let bestPage = 1
        let bestRatio = 0
        for (const [page, ratio] of ratios.current) {
          if (ratio > bestRatio) {
            bestRatio = ratio
            bestPage = page
          }
        }
        setCurrentPage(bestPage)
      },
      {
        root: container,
        threshold: [0, 0.25, 0.5, 0.75, 1.0],
      },
    )

    const pages = container.querySelectorAll<HTMLElement>('[data-page-number]')
    pages.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [containerRef, pageCount])

  return currentPage
}
