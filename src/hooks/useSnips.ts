import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface Snip {
  id: string
  slug: string
  full_path: string
  page: number
  label: string
  x: number
  y: number
  width: number
  height: number
  created_at: string
  tags: string[]
}

export function useSnips(slug: string | undefined, dirPath: string | undefined) {
  const [snips, setSnips] = useState<Snip[]>([])
  const [xp, setXp] = useState(0)

  useEffect(() => {
    if (!slug || !dirPath) return
    let cancelled = false
    invoke<Snip[]>('list_snips', { dirPath, slug })
      .then((result) => {
        if (!cancelled) {
          setSnips(result)
        }
      })
      .catch((err) => console.error('list_snips failed:', err))

    invoke<number>('get_xp', { dirPath, slug })
      .then((val) => {
        if (!cancelled) setXp(val)
      })
      .catch((err) => console.error('get_xp failed:', err))

    return () => {
      cancelled = true
    }
  }, [slug, dirPath])

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
      if (!slug || !dirPath) return
      const snip = await invoke<Snip>('create_snip', {
        dirPath,
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
    [slug, dirPath],
  )

  const removeSnip = useCallback(async (id: string) => {
    if (!dirPath) return
    await invoke('delete_snip', { dirPath, id })
    setSnips((prev) => prev.filter((s) => s.id !== id))
  }, [dirPath])

  const incrementXp = useCallback(async () => {
    if (!slug || !dirPath) return 0
    try {
      const newVal = await invoke<number>('increment_xp', { dirPath, slug })
      setXp(newVal)
      return newVal
    } catch (err) {
      console.error('increment_xp failed:', err)
      return xp
    }
  }, [slug, dirPath, xp])

  return { snips, xp, addSnip, removeSnip, incrementXp }
}
