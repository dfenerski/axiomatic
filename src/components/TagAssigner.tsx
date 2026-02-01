import { useEffect, useRef } from 'react'
import type { Tag } from '../hooks/useTags'

interface Props {
  slug: string
  title: string
  tags: Tag[]
  bookTags: Tag[]
  onTag: (slug: string, tagId: number) => void
  onUntag: (slug: string, tagId: number) => void
  onClose: () => void
}

export function TagAssigner({ slug, title, tags, bookTags, onTag, onUntag, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const assignedIds = new Set(bookTags.map((t) => t.id))

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed inset-y-0 right-0 z-30 flex w-64 flex-col border-l border-[#eee8d5] bg-[#fdf6e3] shadow-lg dark:border-[#073642] dark:bg-[#002b36]"
    >
      <div className="flex items-center justify-between border-b border-[#eee8d5] px-4 py-3 dark:border-[#073642]">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[#073642] dark:text-[#eee8d5]">Tags</h2>
          <p className="truncate text-xs text-[#93a1a1] dark:text-[#657b83]">{title}</p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded p-1 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
          aria-label="Close tag assigner"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {tags.length === 0 && (
          <p className="px-2 pt-4 text-center text-xs text-[#93a1a1] dark:text-[#657b83]">
            No tags created yet.
          </p>
        )}
        {tags.map((tag) => {
          const assigned = assignedIds.has(tag.id)
          return (
            <label
              key={tag.id}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-[#eee8d5] dark:hover:bg-[#073642]/50"
            >
              <input
                type="checkbox"
                checked={assigned}
                onChange={() =>
                  assigned ? onUntag(slug, tag.id) : onTag(slug, tag.id)
                }
                className="accent-[#268bd2]"
              />
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-[#586e75] dark:text-[#93a1a1]">
                {tag.name}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
