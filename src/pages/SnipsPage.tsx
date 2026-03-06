import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { invoke } from '@tauri-apps/api/core'
import { useDirectories } from '../hooks/useDirectories'
import { useTextbooks } from '../hooks/useTextbooks'
import { useAllSnips } from '../hooks/useSnips'
import type { SnipWithDir } from '../hooks/useSnips'
import { togglePalette } from '../lib/palette'
import { LoopCarousel } from '../components/LoopCarousel'

interface TagMenuState {
  x: number
  y: number
  snip: SnipWithDir
}

interface SnipContextMenuProps {
  x: number
  y: number
  snip: SnipWithDir
  tagInput: string
  tagSuggestions: string[]
  onTagInputChange: (val: string) => void
  onAddTag: (tag: string) => void
  onRemoveTag: (tag: string) => void
  onNavigate: () => void
  onClose: () => void
}

function SnipContextMenu({
  x,
  y,
  snip,
  tagInput,
  tagSuggestions,
  onTagInputChange,
  onAddTag,
  onRemoveTag,
  onNavigate,
  onClose,
}: SnipContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
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
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 min-w-[180px] rounded-md border border-[#eee8d5] bg-[#fdf6e3] py-1 shadow-lg dark:border-[#073642] dark:bg-[#073642]"
      style={{ left: x, top: y }}
    >
      <button
        onClick={() => {
          onNavigate()
          onClose()
        }}
        className="block w-full px-3 py-1.5 text-left text-sm text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
      >
        Open in reader
      </button>

      {snip.tags.length > 0 && (
        <div className="border-t border-[#eee8d5] dark:border-[#073642]">
          {snip.tags.map((tag) => (
            <button
              key={tag}
              onClick={() => onRemoveTag(tag)}
              className="block w-full px-3 py-1.5 text-left text-sm text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
            >
              Remove tag: {tag}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-[#eee8d5] p-2 dark:border-[#073642]">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => onTagInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && tagInput.trim()) {
                e.preventDefault()
                onAddTag(tagInput)
              }
              // Don't propagate Escape from input to document handler twice
              if (e.key === 'Escape') {
                e.stopPropagation()
                onClose()
              }
            }}
            placeholder="Add tag..."
            className="h-6 w-full rounded border border-[#93a1a1]/30 bg-transparent px-1.5 text-xs text-[#073642] outline-none focus:border-[#268bd2] dark:text-[#eee8d5] dark:focus:border-[#268bd2]"
            autoFocus
          />
          <button
            onClick={() => onAddTag(tagInput)}
            disabled={!tagInput.trim()}
            className="shrink-0 rounded px-1.5 py-0.5 text-xs text-[#268bd2] hover:bg-[#eee8d5] disabled:opacity-40 dark:hover:bg-[#073642]"
          >
            Add
          </button>
        </div>
        {tagSuggestions.length > 0 && (
          <div className="mt-1 max-h-24 overflow-y-auto">
            {tagSuggestions.map((tag) => (
              <button
                key={tag}
                onClick={() => onAddTag(tag)}
                className="block w-full px-1.5 py-0.5 text-left text-xs text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export function SnipsPage() {
  const navigate = useNavigate()
  const { directories } = useDirectories()
  const { textbooks, loading: booksLoading } = useTextbooks()
  const { snips, loading: snipsLoading, addTag, removeTag } = useAllSnips(directories)

  const [search, setSearch] = useState('')
  const [dirFilter, setDirFilter] = useState<string>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const [loopOpen, setLoopOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [tagMenu, setTagMenu] = useState<TagMenuState | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [allSnipTags, setAllSnipTags] = useState<string[]>([])

  const searchRef = useRef<HTMLInputElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const tagDropdownRef = useRef<HTMLDivElement>(null)

  const loading = booksLoading || snipsLoading

  // Build a slug -> title map from textbooks
  const slugToTitle = useMemo(() => {
    const map: Record<string, string> = {}
    for (const book of textbooks) {
      map[book.slug] = book.title
    }
    return map
  }, [textbooks])

  // Collect all unique tags across snips for the tag filter dropdown
  const uniqueTags = useMemo(() => {
    const tags = new Set<string>()
    for (const s of snips) {
      for (const t of s.tags) tags.add(t)
    }
    return Array.from(tags).sort()
  }, [snips])

  // Load all snip tags from all directories for autocomplete
  useEffect(() => {
    if (directories.length === 0) return
    let cancelled = false
    Promise.all(
      directories.map((dir) =>
        invoke<string[]>('list_all_snip_tags', { dirPath: dir.path }).catch(() => [] as string[]),
      ),
    ).then((results) => {
      if (cancelled) return
      const merged = new Set<string>()
      for (const tags of results) {
        for (const t of tags) merged.add(t)
      }
      setAllSnipTags(Array.from(merged).sort())
    })
    return () => {
      cancelled = true
    }
  }, [directories, snips])

  // Filtered rows
  const filteredSnips = useMemo(() => {
    let result = snips

    // Directory filter (single-select, intersection with tag filter)
    if (dirFilter !== 'all') {
      result = result.filter((s) => s.dirPath === dirFilter)
    }

    // Tag filter (multi-select, union: snip matches if it has ANY selected tag)
    if (selectedTags.length > 0) {
      const tagSet = new Set(selectedTags)
      result = result.filter((s) => s.tags.some((t) => tagSet.has(t)))
    }

    // Search filter (case-insensitive substring on label)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((s) => s.label.toLowerCase().includes(q))
    }

    // Sort by created_at descending (newest first)
    return [...result].sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [snips, dirFilter, selectedTags, search])

  // Clamp selectedIndex when filtered rows change
  useEffect(() => {
    setSelectedIndex((prev) => {
      if (filteredSnips.length === 0) return -1
      if (prev >= filteredSnips.length) return filteredSnips.length - 1
      return prev
    })
  }, [filteredSnips.length])

  // Navigate to the snip's source page
  const navigateToSnip = useCallback(
    (snip: SnipWithDir) => {
      navigate(`/read/${snip.slug}?page=${snip.page}`)
    },
    [navigate],
  )

  // Vim j/k navigation (disabled when loop overlay is open — LoopCarousel
  // handles its own keyboard events)
  useEffect(() => {
    if (loopOpen) return

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const count = filteredSnips.length
      if (count === 0 && e.key !== 'Escape' && e.key !== '/') return

      switch (e.key) {
        case 'j':
        case 'ArrowDown': {
          e.preventDefault()
          setSelectedIndex((prev) => {
            if (prev === -1) return 0
            return prev < count - 1 ? prev + 1 : prev
          })
          break
        }
        case 'k':
        case 'ArrowUp': {
          e.preventDefault()
          setSelectedIndex((prev) => {
            if (prev <= 0) return prev
            return prev - 1
          })
          break
        }
        case 'Enter': {
          if (selectedIndex >= 0 && selectedIndex < count) {
            e.preventDefault()
            navigateToSnip(filteredSnips[selectedIndex])
          }
          break
        }
        case '/': {
          e.preventDefault()
          searchRef.current?.focus()
          break
        }
        case 'Escape': {
          e.preventDefault()
          navigate('/')
          break
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [filteredSnips, selectedIndex, navigateToSnip, navigate, loopOpen])

  // Scroll selected row into view
  useEffect(() => {
    if (selectedIndex < 0 || !tableRef.current) return
    const row = tableRef.current.querySelector(`[data-row-index="${selectedIndex}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // Context menu for tag management
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, snip: SnipWithDir) => {
      e.preventDefault()
      setTagMenu({ x: e.clientX, y: e.clientY, snip })
      setTagInput('')
    },
    [],
  )

  const closeTagMenu = useCallback(() => {
    setTagMenu(null)
    setTagInput('')
  }, [])

  // Close tag dropdown on click outside
  useEffect(() => {
    if (!tagDropdownOpen) return
    const handleClick = (e: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setTagDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [tagDropdownOpen])

  // Toggle a tag in the multi-select filter
  const toggleTagFilter = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }, [])

  // Cross-book XP increment for the loop overlay
  const incrementXpForSnip = useCallback(async (dirPath: string, slug: string) => {
    try {
      await invoke<number>('increment_xp', { dirPath, slug })
    } catch (err) {
      console.error('increment_xp failed:', err)
    }
  }, [])

  // Tag autocomplete suggestions
  const tagSuggestions = useMemo(() => {
    if (!tagMenu || !tagInput.trim()) return []
    const q = tagInput.trim().toLowerCase()
    const existing = new Set(tagMenu.snip.tags)
    return allSnipTags.filter((t) => t.toLowerCase().includes(q) && !existing.has(t))
  }, [tagInput, tagMenu, allSnipTags])

  const handleAddTag = useCallback(
    async (tag: string) => {
      if (!tagMenu || !tag.trim()) return
      const trimmed = tag.trim()
      try {
        await addTag(tagMenu.snip.dirPath, tagMenu.snip.id, trimmed)
        setTagInput('')
      } catch (err) {
        console.error('add_snip_tag failed:', err)
      }
    },
    [tagMenu, addTag],
  )

  const handleRemoveTag = useCallback(
    async (tag: string) => {
      if (!tagMenu) return
      try {
        await removeTag(tagMenu.snip.dirPath, tagMenu.snip.id, tag)
      } catch (err) {
        console.error('remove_snip_tag failed:', err)
      }
    },
    [tagMenu, removeTag],
  )

  // Format date as YYYY-MM-DD
  const formatDate = useCallback((iso: string) => {
    if (!iso) return ''
    return iso.slice(0, 10)
  }, [])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#fdf6e3] dark:bg-[#002b36]">
        <p className="text-[#657b83] dark:text-[#93a1a1]">Loading snips...</p>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#fdf6e3] dark:bg-[#002b36]">
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[#eee8d5] bg-[#fdf6e3] px-3 dark:border-[#073642] dark:bg-[#002b36]">
        <button
          onClick={() => navigate('/')}
          className="shrink-0 rounded p-1.5 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
          aria-label="Back to library"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>

        <h1 className="shrink-0 text-sm font-medium text-[#586e75] dark:text-[#93a1a1]">
          Snips
        </h1>

        {/* Directory filter */}
        <select
          value={dirFilter}
          onChange={(e) => setDirFilter(e.target.value)}
          className="h-7 rounded border border-[#93a1a1]/30 bg-[#fdf6e3] px-2 text-xs text-[#586e75] outline-none focus:border-[#268bd2] dark:border-[#073642] dark:bg-[#073642] dark:text-[#93a1a1] dark:focus:border-[#268bd2]"
        >
          <option value="all">All directories</option>
          {directories.map((dir) => (
            <option key={dir.id} value={dir.path}>
              {dir.label}
            </option>
          ))}
        </select>

        {/* Tag filter (multi-select dropdown) */}
        <div ref={tagDropdownRef} className="relative">
          <button
            onClick={() => setTagDropdownOpen((v) => !v)}
            className="flex h-7 items-center gap-1 rounded border border-[#93a1a1]/30 bg-[#fdf6e3] px-2 text-xs text-[#586e75] outline-none hover:border-[#268bd2] dark:border-[#073642] dark:bg-[#073642] dark:text-[#93a1a1] dark:hover:border-[#268bd2]"
          >
            {selectedTags.length === 0
              ? 'All tags'
              : `${selectedTags.length} tag${selectedTags.length !== 1 ? 's' : ''}`}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {tagDropdownOpen && uniqueTags.length > 0 && (
            <div className="absolute left-0 top-8 z-30 max-h-48 min-w-[160px] overflow-y-auto rounded-md border border-[#eee8d5] bg-[#fdf6e3] py-1 shadow-lg dark:border-[#073642] dark:bg-[#073642]">
              {selectedTags.length > 0 && (
                <button
                  onClick={() => setSelectedTags([])}
                  className="block w-full px-3 py-1 text-left text-xs text-[#268bd2] hover:bg-[#eee8d5] dark:hover:bg-[#002b36]"
                >
                  Clear all
                </button>
              )}
              {uniqueTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTagFilter(tag)}
                  className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#002b36]"
                >
                  <span className={`inline-block h-3 w-3 shrink-0 rounded-sm border ${
                    selectedTags.includes(tag)
                      ? 'border-[#268bd2] bg-[#268bd2]'
                      : 'border-[#93a1a1]/50 bg-transparent'
                  }`} />
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Start loop button */}
        <button
          onClick={() => setLoopOpen(true)}
          disabled={filteredSnips.length === 0}
          className="h-7 shrink-0 rounded border border-[#268bd2]/50 bg-[#268bd2]/10 px-3 text-xs font-medium text-[#268bd2] transition-colors hover:bg-[#268bd2]/20 disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#268bd2]/30 dark:bg-[#268bd2]/10 dark:hover:bg-[#268bd2]/20"
        >
          Start loop
        </button>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative flex shrink-0 items-center">
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                setSearch('')
                searchRef.current?.blur()
              }
            }}
            placeholder="Search snips... (/)"
            className="h-7 w-52 rounded border border-[#93a1a1]/30 bg-[#fdf6e3] pl-2 pr-7 text-sm text-[#073642] outline-none focus:border-[#268bd2] dark:border-[#073642] dark:bg-[#073642] dark:text-[#eee8d5] dark:focus:border-[#268bd2]"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('')
                searchRef.current?.focus()
              }}
              className="absolute right-1.5 text-[#93a1a1] hover:text-[#586e75] dark:hover:text-[#93a1a1]"
              aria-label="Clear search"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <button
          onClick={togglePalette}
          className="shrink-0 rounded p-1.5 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
          aria-label="Command palette"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
          </svg>
        </button>
      </div>

      {/* Table */}
      <div ref={tableRef} className="min-h-0 flex-1 overflow-y-auto">
        {filteredSnips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#93a1a1] dark:text-[#657b83]">
            {snips.length === 0 ? (
              <p className="text-sm">No snips yet. Open a book and use the snip tool to capture regions.</p>
            ) : (
              <p className="text-sm">No snips match the current filters.</p>
            )}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[#eee8d5] text-xs font-medium uppercase tracking-wider text-[#93a1a1] dark:bg-[#073642] dark:text-[#586e75]">
              <tr>
                <th className="px-4 py-2">Label</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2 text-right">Page</th>
                <th className="px-4 py-2">Tags</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredSnips.map((snip, i) => (
                <tr
                  key={snip.id}
                  data-row-index={i}
                  onClick={() => navigateToSnip(snip)}
                  onContextMenu={(e) => handleContextMenu(e, snip)}
                  className={`cursor-pointer border-b border-[#eee8d5] transition-colors dark:border-[#073642] ${
                    i === selectedIndex
                      ? 'bg-[#eee8d5] dark:bg-[#073642]'
                      : 'hover:bg-[#eee8d5]/50 dark:hover:bg-[#073642]/50'
                  }`}
                >
                  <td className="px-4 py-2 text-[#073642] dark:text-[#eee8d5]">
                    {snip.label}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-2 text-[#586e75] dark:text-[#93a1a1]">
                    {slugToTitle[snip.slug] ?? snip.slug}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-[#586e75] dark:text-[#93a1a1]">
                    {snip.page + 1}
                  </td>
                  <td className="px-4 py-2 text-[#586e75] dark:text-[#93a1a1]">
                    {snip.tags.length > 0 ? snip.tags.join(', ') : (
                      <span className="text-[#93a1a1]/50 dark:text-[#586e75]/50">--</span>
                    )}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-[#93a1a1] dark:text-[#586e75]">
                    {formatDate(snip.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Tag context menu (custom combined menu with actions + tag input) */}
      {tagMenu && (
        <SnipContextMenu
          x={tagMenu.x}
          y={tagMenu.y}
          snip={tagMenu.snip}
          tagInput={tagInput}
          tagSuggestions={tagSuggestions}
          onTagInputChange={setTagInput}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
          onNavigate={() => navigateToSnip(tagMenu.snip)}
          onClose={closeTagMenu}
        />
      )}

      {/* Footer with count */}
      <div className="flex h-6 shrink-0 items-center border-t border-[#eee8d5] bg-[#fdf6e3] px-3 dark:border-[#073642] dark:bg-[#002b36]">
        <span className="text-[10px] text-[#93a1a1] dark:text-[#586e75]">
          {filteredSnips.length} snip{filteredSnips.length !== 1 ? 's' : ''}
          {filteredSnips.length !== snips.length && ` of ${snips.length} total`}
        </span>
      </div>

      {/* Loop overlay — full-page LoopCarousel over the table */}
      {loopOpen && (
        <div className="absolute inset-0 z-40 flex flex-col bg-[#fdf6e3] dark:bg-[#002b36]">
          <LoopCarousel
            snips={filteredSnips}
            xp={0}
            onIncrementXp={async () => 0}
            onIncrementXpForSnip={incrementXpForSnip}
            onExit={() => setLoopOpen(false)}
            shuffled={true}
          />
        </div>
      )}
    </div>
  )
}
