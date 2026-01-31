import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

export interface SearchMatch {
  page: number
  charStart: number
  charEnd: number
}

export function useSearch(pdfDocument: PDFDocumentProxy | null) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const pageTextsRef = useRef<string[] | null>(null)

  // Extract text from all pages (cached after first extraction)
  const extractTexts = useCallback(async () => {
    if (!pdfDocument || pageTextsRef.current) return pageTextsRef.current
    const texts: string[] = []
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i)
      const content = await page.getTextContent()
      const str = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join('')
      texts.push(str)
    }
    pageTextsRef.current = texts
    return texts
  }, [pdfDocument])

  // Search whenever query changes
  useEffect(() => {
    if (!query.trim()) {
      setMatches([])
      setCurrentIndex(0)
      return
    }

    let cancelled = false

    extractTexts().then((texts) => {
      if (cancelled || !texts) return
      const found: SearchMatch[] = []
      const lowerQuery = query.toLowerCase()
      for (let pageIdx = 0; pageIdx < texts.length; pageIdx++) {
        const text = texts[pageIdx].toLowerCase()
        let start = 0
        while (true) {
          const idx = text.indexOf(lowerQuery, start)
          if (idx === -1) break
          found.push({
            page: pageIdx + 1,
            charStart: idx,
            charEnd: idx + lowerQuery.length,
          })
          start = idx + 1
        }
      }
      setMatches(found)
      setCurrentIndex(0)
    })

    return () => {
      cancelled = true
    }
  }, [query, extractTexts])

  const nextMatch = useCallback(() => {
    if (matches.length === 0) return
    setCurrentIndex((i) => (i + 1) % matches.length)
  }, [matches.length])

  const prevMatch = useCallback(() => {
    if (matches.length === 0) return
    setCurrentIndex((i) => (i - 1 + matches.length) % matches.length)
  }, [matches.length])

  const currentMatchPage = matches.length > 0 ? matches[currentIndex]?.page ?? 0 : 0

  return {
    query,
    setQuery,
    totalMatches: matches.length,
    currentIndex,
    currentMatchPage,
    nextMatch,
    prevMatch,
    searchMatches: matches,
  }
}
