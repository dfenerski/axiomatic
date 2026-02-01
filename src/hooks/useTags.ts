import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface Tag {
  id: number
  name: string
  color: string
}

interface BookTagMapping {
  book_slug: string
  tags: Tag[]
}

export function useTags() {
  const [tags, setTags] = useState<Tag[]>([])
  const [bookTags, setBookTags] = useState<Record<string, Tag[]>>({})

  const refresh = useCallback(async () => {
    try {
      const [tagList, mappings] = await Promise.all([
        invoke<Tag[]>('list_tags'),
        invoke<BookTagMapping[]>('list_book_tags_all'),
      ])
      setTags(tagList)
      const record: Record<string, Tag[]> = {}
      for (const m of mappings) {
        record[m.book_slug] = m.tags
      }
      setBookTags(record)
    } catch (err) {
      console.error('Failed to load tags:', err)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createTag = useCallback(
    async (name: string, color: string) => {
      try {
        await invoke<Tag>('create_tag', { name, color })
        await refresh()
      } catch (err) {
        console.error('Failed to create tag:', err)
      }
    },
    [refresh],
  )

  const deleteTag = useCallback(
    async (id: number) => {
      try {
        await invoke('delete_tag', { id })
        await refresh()
      } catch (err) {
        console.error('Failed to delete tag:', err)
      }
    },
    [refresh],
  )

  const tagBook = useCallback(
    async (bookSlug: string, tagId: number) => {
      try {
        await invoke('tag_book', { bookSlug, tagId })
        await refresh()
      } catch (err) {
        console.error('Failed to tag book:', err)
      }
    },
    [refresh],
  )

  const untagBook = useCallback(
    async (bookSlug: string, tagId: number) => {
      try {
        await invoke('untag_book', { bookSlug, tagId })
        await refresh()
      } catch (err) {
        console.error('Failed to untag book:', err)
      }
    },
    [refresh],
  )

  const updateTagColor = useCallback(
    async (id: number, color: string) => {
      try {
        await invoke('update_tag_color', { id, color })
        await refresh()
      } catch (err) {
        console.error('Failed to update tag color:', err)
      }
    },
    [refresh],
  )

  return { tags, bookTags, createTag, deleteTag, tagBook, untagBook, updateTagColor, refresh }
}
