import { useState, useRef, useEffect, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { SnipTagDef } from '../hooks/useSnipTagDefs'

const TAG_PALETTE = [
  '#dc322f', '#cb4b16', '#b58900', '#859900', '#2aa198',
  '#268bd2', '#6c71c4', '#d33682', '#c97a2c', '#5e8c61',
] as const

interface Props {
  defs: SnipTagDef[]
  anchorRef: RefObject<HTMLElement | null>
  onCreate: (name: string, color: string) => void
  onDelete: (name: string) => void
  onRename: (oldName: string, newName: string) => void
  onRecolor: (name: string, color: string) => void
  onClose: () => void
}

export function SnipTagManager({ defs, anchorRef, onCreate, onDelete, onRename, onRecolor, onClose }: Props) {
  const [newName, setNewName] = useState('')
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    setPos({ left: rect.left, top: rect.bottom + 4 })
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
    const color = TAG_PALETTE[defs.length % TAG_PALETTE.length]
    onCreate(name, color)
    setNewName('')
  }

  const commitRename = (oldName: string) => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== oldName) {
      onRename(oldName, trimmed)
    }
    setEditingName(null)
  }

  if (!pos) return null

  return createPortal(
    <div
      ref={ref}
      style={{ left: pos.left, top: pos.top, position: 'fixed' }}
      className="z-50 w-56 rounded-md border border-[#eee8d5] bg-[#fdf6e3] py-1 shadow-lg dark:border-[#073642] dark:bg-[#073642]"
    >
      <div className="max-h-48 overflow-y-auto">
        {defs.length === 0 && (
          <p className="px-3 py-2 text-xs text-[#93a1a1] dark:text-[#657b83]">No snip tags yet</p>
        )}
        {defs.map((def) => (
          <div
            key={def.name}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#002b36]/50"
          >
            <label className="relative shrink-0 cursor-pointer">
              <span
                className="block h-3 w-3 rounded-full"
                style={{ backgroundColor: def.color }}
              />
              <input
                type="color"
                value={def.color}
                onChange={(e) => onRecolor(def.name, e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            {editingName === def.name ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => commitRename(def.name)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(def.name)
                  if (e.key === 'Escape') setEditingName(null)
                  if (e.key !== 'Escape') e.stopPropagation()
                }}
                className="min-w-0 flex-1 rounded border border-[#268bd2] bg-transparent px-1 text-sm outline-none"
              />
            ) : (
              <span
                className="min-w-0 flex-1 cursor-text truncate"
                onDoubleClick={() => {
                  setEditingName(def.name)
                  setEditValue(def.name)
                }}
              >
                {def.name}
              </span>
            )}
            <button
              onClick={() => onDelete(def.name)}
              className="shrink-0 rounded p-0.5 text-[#93a1a1] hover:text-[#dc322f] dark:text-[#657b83] dark:hover:text-red-400"
              aria-label={`Delete ${def.name}`}
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
            if (e.key !== 'Escape') e.stopPropagation()
          }}
          placeholder="New tag…"
          className="h-7 w-full rounded border border-[#93a1a1] bg-[#fdf6e3] px-2 text-sm text-[#073642] outline-none focus:border-blue-400 dark:border-[#073642] dark:bg-[#002b36] dark:text-[#eee8d5] dark:focus:border-[#268bd2]"
        />
      </div>
    </div>,
    document.body,
  )
}
