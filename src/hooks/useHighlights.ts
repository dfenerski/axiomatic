import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface Highlight {
  id: number
  slug: string
  page: number
  x: number
  y: number
  width: number
  height: number
  color: string
  note: string
  text: string
  group_id: string
  created_at: string
}

export function useHighlights(slug: string | undefined) {
  const [highlights, setHighlights] = useState<Highlight[]>([])

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    invoke<Highlight[]>('list_highlights', { slug })
      .then((h) => {
        if (!cancelled) setHighlights(h)
      })
      .catch((err) => console.error('list_highlights failed:', err))
    return () => {
      cancelled = true
    }
  }, [slug])

  const createHighlight = useCallback(
    async (
      page: number,
      x: number,
      y: number,
      width: number,
      height: number,
      color: string,
      note = '',
      text = '',
      groupId = '',
    ) => {
      if (!slug) return
      const h = await invoke<Highlight>('create_highlight', {
        slug,
        page,
        x,
        y,
        width,
        height,
        color,
        note,
        text,
        groupId,
      })
      setHighlights((prev) => [...prev, h])
      return h
    },
    [slug],
  )

  const deleteHighlight = useCallback(
    async (id: number) => {
      await invoke('delete_highlight', { id })
      setHighlights((prev) => prev.filter((h) => h.id !== id))
    },
    [],
  )

  const deleteHighlightGroup = useCallback(
    async (groupId: string) => {
      if (!groupId) return
      await invoke('delete_highlight_group', { groupId })
      setHighlights((prev) => prev.filter((h) => h.group_id !== groupId))
    },
    [],
  )

  const colorHighlights = useMemo(
    () => highlights.filter((h) => h.color !== 'bookmark'),
    [highlights],
  )

  const bookmarkHighlights = useMemo(
    () => highlights.filter((h) => h.color === 'bookmark'),
    [highlights],
  )

  const highlightsForPage = useCallback(
    (page: number) => highlights.filter((h) => h.page === page),
    [highlights],
  )

  const bookmarksForPage = useCallback(
    (page: number) => bookmarkHighlights.filter((h) => h.page === page),
    [bookmarkHighlights],
  )

  return { highlights, colorHighlights, bookmarkHighlights, createHighlight, deleteHighlight, deleteHighlightGroup, highlightsForPage, bookmarksForPage }
}
