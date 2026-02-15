import { useCallback, useEffect, useRef, useState } from 'react'

export interface Command {
  id: string
  label: string
  shortcut?: string
  action: () => void
}

interface Props {
  commands: Command[]
  onClose: () => void
}

export function CommandPalette({ commands, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = query
    ? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands

  // Reset selection when filter changes
  useEffect(() => {
    setSelected(0)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[selected] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const execute = useCallback(
    (idx: number) => {
      const cmd = filtered[idx]
      if (cmd) {
        onClose()
        cmd.action()
      }
    },
    [filtered, onClose],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelected((s) => (s + 1) % Math.max(1, filtered.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelected((s) => (s - 1 + filtered.length) % Math.max(1, filtered.length))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        execute(selected)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [filtered.length, selected, execute, onClose],
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50" onClick={onClose} />
      {/* Palette */}
      <div
        className="fixed top-16 left-1/2 z-50 w-[300px] -translate-x-1/2 rounded-lg border border-[#93a1a1]/30 bg-[#fdf6e3] shadow-lg dark:border-[#073642] dark:bg-[#002b36] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
        onKeyDown={handleKeyDown}
      >
        {/* Input */}
        <div className="flex items-center border-b border-[#eee8d5] dark:border-[#073642]">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command…"
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-[#073642] outline-none placeholder:text-[#93a1a1] dark:text-[#eee8d5] dark:placeholder:text-[#586e75]"
          />
          <button
            onClick={onClose}
            className="shrink-0 p-2 text-[#93a1a1] hover:text-[#586e75] dark:hover:text-[#93a1a1]"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {/* Command list */}
        <div ref={listRef} className="max-h-[320px] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-[#93a1a1] dark:text-[#586e75]">
              No matching commands
            </div>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              onClick={() => execute(i)}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm ${
                i === selected
                  ? 'bg-[#eee8d5] text-[#073642] dark:bg-[#073642] dark:text-[#eee8d5]'
                  : 'text-[#586e75] dark:text-[#93a1a1]'
              }`}
            >
              <span>{cmd.label}</span>
              {cmd.shortcut && (
                <span className="ml-4 text-xs text-[#93a1a1] dark:text-[#586e75]">
                  {cmd.shortcut}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
