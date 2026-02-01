import { useState, useRef, useEffect, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { Tag } from '../hooks/useTags'
import { defaultTagColor } from '../lib/tag-colors'

interface Props {
  tags: Tag[]
  anchorRef: RefObject<HTMLElement | null>
  onCreate: (name: string, color: string) => void
  onDelete: (id: number) => void
  onUpdateColor: (id: number, color: string) => void
  onClose: () => void
}

export function TagManager({ tags, anchorRef, onCreate, onDelete, onUpdateColor, onClose }: Props) {
  const [newName, setNewName] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null)

  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    setPos({ left: rect.left, bottom: window.innerHeight - rect.top + 4 })
  }, [anchorRef])

  useEffect(() => {
    if (pos) inputRef.current?.focus()
  }, [pos])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose, anchorRef])

  const handleCreate = () => {
    const name = newName.trim()
    if (!name) return
    const color = defaultTagColor(tags.length)
    onCreate(name, color)
    setNewName('')
  }

  if (!pos) return null

  return createPortal(
    <div
      ref={ref}
      style={{ left: pos.left, bottom: pos.bottom, position: 'fixed' }}
      className="z-50 w-56 rounded-md border border-[#eee8d5] bg-[#fdf6e3] py-1 shadow-lg dark:border-[#073642] dark:bg-[#073642]"
    >
      <div className="max-h-48 overflow-y-auto">
        {tags.length === 0 && (
          <p className="px-3 py-2 text-xs text-[#93a1a1] dark:text-[#657b83]">No tags yet</p>
        )}
        {tags.map((tag) => (
          <div
            key={tag.id}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#002b36]/50"
          >
            <label className="relative shrink-0 cursor-pointer">
              <span
                className="block h-3 w-3 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              <input
                type="color"
                value={tag.color}
                onChange={(e) => onUpdateColor(tag.id, e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <span className="min-w-0 flex-1 truncate">{tag.name}</span>
            <button
              onClick={() => onDelete(tag.id)}
              className="shrink-0 rounded p-0.5 text-[#93a1a1] hover:text-[#dc322f] dark:text-[#657b83] dark:hover:text-red-400"
              aria-label={`Delete ${tag.name}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <div className="border-t border-[#eee8d5] px-3 py-2 dark:border-[#073642]">
        <input
          ref={inputRef}
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate()
            e.stopPropagation()
          }}
          placeholder="New tag…"
          className="h-7 w-full rounded border border-[#93a1a1] bg-[#fdf6e3] px-2 text-sm text-[#073642] outline-none focus:border-blue-400 dark:border-[#073642] dark:bg-[#002b36] dark:text-[#eee8d5] dark:focus:border-[#268bd2]"
        />
      </div>
    </div>,
    document.body
  )
}
