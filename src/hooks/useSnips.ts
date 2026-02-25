import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface Snip {
  id: number
  slug: string
  full_path: string
  page: number
  label: string
  x: number
  y: number
  width: number
  height: number
  created_at: string
}

function loadXp(slug: string): number {
  try {
    return Number(localStorage.getItem(`snipXp:${slug}`)) || 0
  } catch {
    return 0
  }
}

function saveXp(slug: string, xp: number) {
  localStorage.setItem(`snipXp:${slug}`, String(xp))
}

export function useSnips(slug: string | undefined) {
  const [snips, setSnips] = useState<Snip[]>([])
  const [xp, setXp] = useState(() => (slug ? loadXp(slug) : 0))

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    invoke<Snip[]>('list_snips', { slug })
      .then((result) => {
        if (!cancelled) {
          setSnips(result)
          setXp(loadXp(slug))
        }
      })
      .catch((err) => console.error('list_snips failed:', err))
    return () => {
      cancelled = true
    }
  }, [slug])

  const addSnip = useCallback(
    async (
      fullPath: string,
      page: number,
      label: string,
      x: number,
      y: number,
      width: number,
      height: number,
    ) => {
      if (!slug) return
      const snip = await invoke<Snip>('create_snip', {
        slug,
        fullPath,
        page,
        label,
        x,
        y,
        width,
        height,
      })
      setSnips((prev) => [...prev, snip])
      return snip
    },
    [slug],
  )

  const removeSnip = useCallback(async (id: number) => {
    await invoke('delete_snip', { id })
    setSnips((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const incrementXp = useCallback(() => {
    if (!slug) return 0
    const current = loadXp(slug)
    const next = current + 1
    saveXp(slug, next)
    setXp(next)
    return next
  }, [slug])

  return { snips, xp, addSnip, removeSnip, incrementXp }
}
