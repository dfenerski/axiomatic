import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { invoke } from '@tauri-apps/api/core'
import type { EditorView } from '@codemirror/view'
import { useDirectories } from '../hooks/useDirectories'
import { useTextbooks } from '../hooks/useTextbooks'
import { useAllSnips } from '../hooks/useSnips'
import type { SnipWithDir } from '../hooks/useSnips'
import { useSnipTagDefs } from '../hooks/useSnipTagDefs'
import { useNotes, useNoteContent } from '../hooks/useNotes'
import { togglePalette } from '../lib/palette'
import { LoopCarousel } from '../components/LoopCarousel'
import { NotesPanel } from '../components/NotesPanel'
import { PomodoroTimer } from '../components/PomodoroTimer'
import { ZoomableSnipImage } from '../components/ZoomableSnipImage'
import { SnipTagManager } from '../components/SnipTagManager'
import { SnipTagAssigner } from '../components/SnipTagAssigner'

interface ContextMenuState {
  x: number
  y: number
  snip: SnipWithDir
}

// Module-level cache: survives component unmount/remount within the same session
const _filterCache = { search: '', dirFilter: 'all', selectedTags: [] as string[] }

/** @internal — test-only reset */
// eslint-disable-next-line react-refresh/only-export-components
export function _resetFilterCache() {
  _filterCache.search = ''
  _filterCache.dirFilter = 'all'
  _filterCache.selectedTags = []
}

export function SnipsPage() {
  const navigate = useNavigate()
  const { directories } = useDirectories()
  const { textbooks, loading: booksLoading } = useTextbooks()
  const {
    snips, loading: snipsLoading, addTag, removeTag,
    renameSnip, deleteSnip, bulkAddTag, bulkRemoveTag, refresh: refreshSnips,
  } = useAllSnips(directories)

  const dirPaths = useMemo(() => directories.map((d) => d.path), [directories])

  // Build slug → full_path and dir:file → full_path map for snip path resolution
  const pathMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const tb of textbooks) {
      map.set(tb.slug, tb.full_path)
      map.set(tb.dir_path + ':' + tb.file, tb.full_path)
    }
    return map
  }, [textbooks])
  const { defs: tagDefs, createDef, deleteDef, renameDef, recolorDef } = useSnipTagDefs(dirPaths)

  // Build a color lookup from tag defs
  const tagColorMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const d of tagDefs) map.set(d.name, d.color)
    return map
  }, [tagDefs])

  const [search, _setSearch] = useState(_filterCache.search)
  const setSearch = useCallback((v: string | ((prev: string) => string)) => {
    _setSearch((prev) => { const next = typeof v === 'function' ? v(prev) : v; _filterCache.search = next; return next })
  }, [])
  const [dirFilter, _setDirFilter] = useState<string>(_filterCache.dirFilter)
  const setDirFilter = useCallback((v: string) => { _filterCache.dirFilter = v; _setDirFilter(v) }, [])
  const [selectedTags, _setSelectedTags] = useState<string[]>(_filterCache.selectedTags)
  const setSelectedTags = useCallback((v: string[] | ((prev: string[]) => string[])) => {
    _setSelectedTags((prev) => { const next = typeof v === 'function' ? v(prev) : v; _filterCache.selectedTags = next; return next })
  }, [])
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const [tagSearch, setTagSearch] = useState('')
  const [loopOpen, setLoopOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [tagAssignerOpen, setTagAssignerOpen] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [viewStartIndex, setViewStartIndex] = useState<number | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const tagDropdownRef = useRef<HTMLDivElement>(null)
  const tagManagerBtnRef = useRef<HTMLButtonElement>(null)
  const editorRef = useRef<EditorView | null>(null)

  const { ensureNote, setNote } = useNotes()

  const loading = booksLoading || snipsLoading

  const slugToTitle = useMemo(() => {
    const map: Record<string, string> = {}
    for (const book of textbooks) map[book.slug] = book.title
    return map
  }, [textbooks])

  const uniqueTags = useMemo(() => {
    const tags = new Set<string>()
    for (const s of snips) for (const t of s.tags) tags.add(t)
    return Array.from(tags).sort()
  }, [snips])

  const filteredSnips = useMemo(() => {
    let result = snips
    if (dirFilter !== 'all') result = result.filter((s) => s.dirPath === dirFilter)
    if (selectedTags.length > 0) {
      const tagSet = new Set(selectedTags)
      result = result.filter((s) => [...tagSet].every((t) => s.tags.includes(t)))
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((s) => s.label.toLowerCase().includes(q))
    }
    return [...result].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.slug.localeCompare(b.slug) || a.page - b.page)
  }, [snips, dirFilter, selectedTags, search])

  const highlightedSnip = selectedIndex >= 0 ? filteredSnips[selectedIndex] : undefined
  const noteContent = useNoteContent(highlightedSnip?.slug, highlightedSnip?.page ?? 0)

  useEffect(() => {
    if (highlightedSnip && notesOpen) ensureNote(highlightedSnip.slug, highlightedSnip.page)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slug+page are the meaningful deps, not the full object
  }, [highlightedSnip?.slug, highlightedSnip?.page, notesOpen, ensureNote])

  // Clamp selectedIndex when filtered rows change
  useEffect(() => {
     
    setSelectedIndex((prev) => {
      if (filteredSnips.length === 0) return -1
      if (prev >= filteredSnips.length) return filteredSnips.length - 1
      return prev
    })
  }, [filteredSnips.length])

  // Clear selection when snips change
  useEffect(() => {
     
    setSelectedIds((prev) => {
      const validIds = new Set(snips.map((s) => s.id))
      const next = new Set([...prev].filter((id) => validIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [snips])

  const navigateToSnip = useCallback(
    (snip: SnipWithDir) => navigate(`/read/${snip.slug}?page=${snip.page}`),
    [navigate],
  )

  // Vim j/k navigation
  useEffect(() => {
    if (loopOpen || viewStartIndex !== null) return
    const handler = (e: KeyboardEvent) => {
      // Escape always closes panes regardless of focus
      if (e.key === 'Escape') {
        e.preventDefault()
        if (notesOpen) setNotesOpen(false)
        else if (tagManagerOpen) setTagManagerOpen(false)
        else if (tagAssignerOpen) setTagAssignerOpen(false)
        else if (selectedIds.size > 0) setSelectedIds(new Set())
        else navigate('/')
        return
      }

      // Ctrl+L: toggle notes panel for highlighted snip
      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault()
        setNotesOpen((v) => {
          if (!v && selectedIndex >= 0) {
            const snip = filteredSnips[selectedIndex]
            if (snip) ensureNote(snip.slug, snip.page)
            setTimeout(() => editorRef.current?.focus(), 50)
          }
          return !v
        })
        return
      }

      // Ctrl+H: close notes if open, else navigate to library
      if (e.ctrlKey && e.key === 'h') {
        e.preventDefault()
        if (notesOpen) {
          setNotesOpen(false)
        } else {
          navigate('/')
        }
        return
      }

      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement).closest?.('.cm-editor')) return
      const count = filteredSnips.length
      if (count === 0 && e.key !== '/') return

      switch (e.key) {
        case 'j': case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => prev === -1 ? 0 : Math.min(prev + 1, count - 1))
          break
        case 'k': case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => prev <= 0 ? prev : prev - 1)
          break
        case 'l':
          if (selectedIndex >= 0 && selectedIndex < count) {
            e.preventDefault()
            setExpandedIds((prev) => {
              const next = new Set(prev)
              next.add(filteredSnips[selectedIndex].id)
              return next
            })
          }
          break
        case 'h':
          if (selectedIndex >= 0 && selectedIndex < count) {
            e.preventDefault()
            setExpandedIds((prev) => {
              const next = new Set(prev)
              next.delete(filteredSnips[selectedIndex].id)
              return next
            })
          }
          break
        case 'Enter':
          if (selectedIndex >= 0 && selectedIndex < count) {
            e.preventDefault()
            navigateToSnip(filteredSnips[selectedIndex])
          }
          break
        case '/':
          e.preventDefault()
          searchRef.current?.focus()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [filteredSnips, selectedIndex, navigateToSnip, navigate, loopOpen, viewStartIndex, selectedIds.size, notesOpen, tagManagerOpen, tagAssignerOpen, ensureNote])

  // Scroll selected row into view
  useEffect(() => {
    if (selectedIndex < 0 || !tableRef.current) return
    const row = tableRef.current.querySelector(`[data-row-index="${selectedIndex}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // Close tag dropdown on click outside
  useEffect(() => {
    if (!tagDropdownOpen) return
    const handleClick = (e: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setTagDropdownOpen(false)
        setTagSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [tagDropdownOpen])

  const toggleTagFilter = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }, [])

  const incrementXpForSnip = useCallback(async (dirPath: string, slug: string) => {
    try { await invoke<number>('increment_xp', { dirPath, slug }) }
    catch (err) { console.error('increment_xp failed:', err) }
  }, [])

  // Multi-select helpers
  const toggleSelect = useCallback((id: string, shiftKey: boolean) => {
    if (shiftKey && selectedIds.size > 0) {
      // Shift-click: range select from last selected to current
      const lastSelected = [...selectedIds].pop()!
      const lastIdx = filteredSnips.findIndex((s) => s.id === lastSelected)
      const currentIdx = filteredSnips.findIndex((s) => s.id === id)
      if (lastIdx >= 0 && currentIdx >= 0) {
        const [start, end] = lastIdx < currentIdx ? [lastIdx, currentIdx] : [currentIdx, lastIdx]
        const next = new Set(selectedIds)
        for (let i = start; i <= end; i++) next.add(filteredSnips[i].id)
        setSelectedIds(next)
        return
      }
    }
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [selectedIds, filteredSnips])

  const selectAll = useCallback(() => {
    if (selectedIds.size === filteredSnips.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredSnips.map((s) => s.id)))
    }
  }, [selectedIds.size, filteredSnips])

  const selectedSnips = useMemo(
    () => filteredSnips.filter((s) => selectedIds.has(s.id)),
    [filteredSnips, selectedIds],
  )

  // Inline rename
  const startRename = useCallback((snip: SnipWithDir) => {
    setRenamingId(snip.id)
    setRenameValue(snip.label)
  }, [])

  const commitRename = useCallback(async () => {
    if (!renamingId) return
    const snip = snips.find((s) => s.id === renamingId)
    if (snip && renameValue.trim() && renameValue.trim() !== snip.label) {
      await renameSnip(snip.dirPath, snip.id, renameValue.trim())
    }
    setRenamingId(null)
  }, [renamingId, renameValue, snips, renameSnip])

  // Delete selected snips
  const handleDeleteSelected = useCallback(async () => {
    const toDelete = snips.filter((s) => selectedIds.has(s.id))
    for (const snip of toDelete) {
      await deleteSnip(snip.dirPath, snip.id)
    }
    setSelectedIds(new Set())
  }, [selectedIds, snips, deleteSnip])

  // Context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, snip: SnipWithDir) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, snip })
  }, [])

  // Tag def CRUD with snip refresh
  const handleCreateDef = useCallback(async (name: string, color: string) => {
    await createDef(name, color)
  }, [createDef])

  const handleDeleteDef = useCallback(async (name: string) => {
    await deleteDef(name)
    await refreshSnips()
  }, [deleteDef, refreshSnips])

  const handleRenameDef = useCallback(async (oldName: string, newName: string) => {
    await renameDef(oldName, newName)
    await refreshSnips()
  }, [renameDef, refreshSnips])

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
      <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-[#eee8d5] bg-[#fdf6e3] px-2 dark:border-[#073642] dark:bg-[#002b36]">
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

        <h1 className="shrink-0 text-sm font-medium text-[#586e75] dark:text-[#93a1a1]">Snips</h1>

        <select
          value={dirFilter}
          onChange={(e) => setDirFilter(e.target.value)}
          className="h-7 rounded border border-[#93a1a1]/30 bg-[#fdf6e3] px-2 text-xs text-[#586e75] outline-none focus:border-[#268bd2] dark:border-[#073642] dark:bg-[#073642] dark:text-[#93a1a1] dark:focus:border-[#268bd2]"
        >
          <option value="all">All directories</option>
          {directories.map((dir) => (
            <option key={dir.id} value={dir.path}>{dir.label}</option>
          ))}
        </select>

        {/* Tag filter dropdown with colored pills */}
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
            <div className="absolute left-0 top-8 z-30 w-48 rounded-md border border-[#eee8d5] bg-[#fdf6e3] py-1 shadow-lg sm:w-56 dark:border-[#073642] dark:bg-[#073642]">
              <div className="px-2 pb-1">
                <input
                  type="text"
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  placeholder="Search tags..."
                  className="h-6 w-full rounded border border-[#93a1a1]/30 bg-transparent px-2 text-xs text-[#073642] outline-none focus:border-[#268bd2] dark:text-[#eee8d5] dark:focus:border-[#268bd2]"
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
              {selectedTags.length > 0 && (
                <button
                  onClick={() => setSelectedTags([])}
                  className="block w-full px-3 py-1 text-left text-xs text-[#268bd2] hover:bg-[#eee8d5] dark:hover:bg-[#002b36]"
                >
                  Clear all
                </button>
              )}
              <div className="max-h-40 overflow-y-auto">
                {uniqueTags
                  .filter((tag) => !tagSearch.trim() || tag.toLowerCase().includes(tagSearch.trim().toLowerCase()))
                  .map((tag) => (
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
                    {tagColorMap.has(tag) && (
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tagColorMap.get(tag) }} />
                    )}
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => setLoopOpen(true)}
          disabled={filteredSnips.length === 0}
          className="h-7 shrink-0 rounded border border-[#268bd2]/50 bg-[#268bd2]/10 px-3 text-xs font-medium text-[#268bd2] transition-colors hover:bg-[#268bd2]/20 disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#268bd2]/30 dark:bg-[#268bd2]/10 dark:hover:bg-[#268bd2]/20"
        >
          Loop
        </button>

        {/* Tag manager button */}
        <button
          ref={tagManagerBtnRef}
          onClick={() => setTagManagerOpen((v) => !v)}
          className="h-7 shrink-0 rounded border border-[#93a1a1]/30 bg-[#fdf6e3] px-2 text-xs text-[#586e75] hover:border-[#268bd2] dark:border-[#073642] dark:bg-[#073642] dark:text-[#93a1a1] dark:hover:border-[#268bd2]"
        >
          Manage tags
        </button>

        {/* Select mode toggle */}
        <button
          onClick={() => { setSelectMode((v) => !v); if (selectMode) setSelectedIds(new Set()) }}
          aria-label="Toggle select mode"
          className={`h-7 shrink-0 rounded border px-2 text-xs ${
            selectMode
              ? 'border-[#268bd2] bg-[#268bd2]/10 text-[#268bd2] dark:border-[#268bd2]/50'
              : 'border-[#93a1a1]/30 bg-[#fdf6e3] text-[#586e75] hover:border-[#268bd2] dark:border-[#073642] dark:bg-[#073642] dark:text-[#93a1a1] dark:hover:border-[#268bd2]'
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </button>

        {/* Selection toolbar */}
        {selectMode && selectedIds.size > 0 && (
          <>
            <div className="mx-1 h-4 w-px bg-[#93a1a1]/30 dark:bg-[#073642]" />
            <span className="text-xs text-[#586e75] dark:text-[#93a1a1]">
              {selectedIds.size} selected
            </span>
            <button
              onClick={() => setTagAssignerOpen(true)}
              className="h-7 shrink-0 rounded border border-[#859900]/50 bg-[#859900]/10 px-2 text-xs text-[#859900] hover:bg-[#859900]/20 dark:border-[#859900]/30"
            >
              Tag
            </button>
            <button
              onClick={handleDeleteSelected}
              className="h-7 shrink-0 rounded border border-[#dc322f]/50 bg-[#dc322f]/10 px-2 text-xs text-[#dc322f] hover:bg-[#dc322f]/20 dark:border-[#dc322f]/30"
            >
              Delete
            </button>
          </>
        )}

        <div className="flex-1" />

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
            className="h-7 w-28 rounded border border-[#93a1a1]/30 bg-[#fdf6e3] pl-2 pr-7 text-sm text-[#073642] outline-none focus:border-[#268bd2] sm:w-52 dark:border-[#073642] dark:bg-[#073642] dark:text-[#eee8d5] dark:focus:border-[#268bd2]"
          />
          {search && (
            <button
              onClick={() => { setSearch(''); searchRef.current?.focus() }}
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

      {/* Table + Notes */}
      <div className="flex min-h-0 flex-1">
      <div ref={tableRef} className="min-h-0 flex-1 overflow-y-auto">
        {filteredSnips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#93a1a1] dark:text-[#657b83]">
            <p className="text-sm">
              {snips.length === 0
                ? 'No snips yet. Open a book and use the snip tool to capture regions.'
                : 'No snips match the current filters.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[#eee8d5] text-xs font-medium uppercase tracking-wider text-[#93a1a1] dark:bg-[#073642] dark:text-[#586e75]">
              <tr>
                {selectMode && (
                  <th className="w-8 px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredSnips.length && filteredSnips.length > 0}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredSnips.length
                      }}
                      onChange={selectAll}
                      className="h-4 w-4 accent-[#268bd2]"
                    />
                  </th>
                )}
                <th className="px-4 py-2">Label</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2 text-right">Page</th>
                <th className="px-4 py-2">Tags</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredSnips.map((snip, i) => {
                const isSelected = selectedIds.has(snip.id)
                return (
                  <React.Fragment key={snip.id}>
                  <tr
                    data-row-index={i}
                    onClick={(e) => {
                      if (!selectMode) return
                      if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return
                      if ((e.target as HTMLElement).closest('input[type="text"]')) return
                      if (renamingId) return
                      toggleSelect(snip.id, e.shiftKey)
                    }}
                    onContextMenu={(e) => handleContextMenu(e, snip)}
                    className={`border-b border-[#eee8d5] transition-colors select-none dark:border-[#073642] ${
                      i === selectedIndex
                        ? 'bg-[#eee8d5] dark:bg-[#073642]'
                        : isSelected
                          ? 'bg-[#eee8d5]/70 dark:bg-[#073642]/70'
                          : 'hover:bg-[#eee8d5]/50 dark:hover:bg-[#073642]/50'
                    }`}
                  >
                    {selectMode && (
                    <td className="w-8 px-2 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleSelect(snip.id, e.nativeEvent instanceof MouseEvent && e.nativeEvent.shiftKey)}
                        className="h-4 w-4 accent-[#268bd2]"
                      />
                    </td>
                    )}
                    <td
                      className="px-4 py-2 text-[#073642] dark:text-[#eee8d5]"
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        startRename(snip)
                      }}
                    >
                      {renamingId === snip.id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename()
                            if (e.key === 'Escape') setRenamingId(null)
                            e.stopPropagation()
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full rounded border border-[#268bd2] bg-transparent px-1 text-sm outline-none"
                        />
                      ) : (
                        snip.label
                      )}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2 text-[#586e75] dark:text-[#93a1a1]">
                      {slugToTitle[snip.slug] ?? snip.slug}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-[#586e75] dark:text-[#93a1a1]">
                      {snip.page + 1}
                    </td>
                    <td className="px-4 py-2">
                      {snip.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {snip.tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                              style={{
                                backgroundColor: (tagColorMap.get(tag) ?? '#93a1a1') + '20',
                                color: tagColorMap.get(tag) ?? '#586e75',
                              }}
                            >
                              <span
                                className="inline-block h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: tagColorMap.get(tag) ?? '#93a1a1' }}
                              />
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[#93a1a1]/50 dark:text-[#586e75]/50">--</span>
                      )}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-[#93a1a1] dark:text-[#586e75]">
                      {snip.created_at.slice(0, 10)}
                    </td>
                  </tr>
                  {expandedIds.has(snip.id) && (
                    <tr className="border-b border-[#eee8d5] bg-[#eee8d5]/30 dark:border-[#073642] dark:bg-[#073642]/30">
                      <td colSpan={selectMode ? 6 : 5} className="px-4 py-4">
                        <div className="flex gap-6">
                          <ZoomableSnipImage snip={snip} maxHeight="200px" pathMap={pathMap} dirPath={snip.dirPath} />
                          <div className="flex flex-col gap-2 text-sm text-[#586e75] dark:text-[#93a1a1]">
                            <p><span className="font-medium">Source:</span> {slugToTitle[snip.slug] ?? snip.slug}</p>
                            <p><span className="font-medium">Page:</span> {snip.page + 1}</p>
                            <p><span className="font-medium">Region:</span> ({(snip.x * 100).toFixed(0)}%, {(snip.y * 100).toFixed(0)}%) {(snip.width * 100).toFixed(0)}%×{(snip.height * 100).toFixed(0)}%</p>
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={() => navigateToSnip(snip)}
                                className="rounded border border-[#268bd2]/50 bg-[#268bd2]/10 px-3 py-1 text-xs text-[#268bd2] hover:bg-[#268bd2]/20"
                              >
                                Go to page
                              </button>
                              <button
                                onClick={() => setExpandedIds((prev) => { const next = new Set(prev); next.delete(snip.id); return next })}
                                className="rounded border border-[#93a1a1]/30 px-3 py-1 text-xs text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
                              >
                                Collapse
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {notesOpen && highlightedSnip && (
        <NotesPanel
          slug={highlightedSnip.slug}
          page={highlightedSnip.page}
          content={noteContent}
          onUpdate={setNote}
          externalEditorRef={editorRef}
        />
      )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          snip={contextMenu.snip}
          tagDefs={tagDefs}
          onView={() => {
            const idx = filteredSnips.findIndex((s) => s.id === contextMenu.snip.id)
            setViewStartIndex(idx >= 0 ? idx : 0)
            setContextMenu(null)
          }}
          onExpand={() => {
            setExpandedIds((prev) => {
              const next = new Set(prev)
              if (next.has(contextMenu.snip.id)) next.delete(contextMenu.snip.id)
              else next.add(contextMenu.snip.id)
              return next
            })
            setContextMenu(null)
          }}
          onNavigate={() => { navigateToSnip(contextMenu.snip); setContextMenu(null) }}
          onRename={() => { startRename(contextMenu.snip); setContextMenu(null) }}
          onDelete={async () => {
            await deleteSnip(contextMenu.snip.dirPath, contextMenu.snip.id)
            setContextMenu(null)
          }}
          bulkSnips={selectedIds.has(contextMenu.snip.id) && selectedIds.size > 1 ? selectedSnips : null}
          onAddTag={async (tag) => {
            if (selectedIds.has(contextMenu.snip.id) && selectedIds.size > 1) {
              // Bulk tag: group by dirPath
              const byDir = new Map<string, string[]>()
              for (const s of selectedSnips) {
                const ids = byDir.get(s.dirPath) ?? []
                ids.push(s.id)
                byDir.set(s.dirPath, ids)
              }
              for (const [dirPath, ids] of byDir) await bulkAddTag(dirPath, ids, tag)
            } else {
              await addTag(contextMenu.snip.dirPath, contextMenu.snip.id, tag)
            }
          }}
          onRemoveTag={async (tag) => {
            if (selectedIds.has(contextMenu.snip.id) && selectedIds.size > 1) {
              const byDir = new Map<string, string[]>()
              for (const s of selectedSnips) {
                const ids = byDir.get(s.dirPath) ?? []
                ids.push(s.id)
                byDir.set(s.dirPath, ids)
              }
              for (const [dirPath, ids] of byDir) await bulkRemoveTag(dirPath, ids, tag)
            } else {
              await removeTag(contextMenu.snip.dirPath, contextMenu.snip.id, tag)
            }
          }}
          onCreateTag={async (name) => {
            const color = ['#dc322f', '#cb4b16', '#b58900', '#859900', '#2aa198', '#268bd2', '#6c71c4', '#d33682'][tagDefs.length % 8]
            await handleCreateDef(name, color)
            // Also assign the tag to the snip(s)
            if (selectedIds.has(contextMenu.snip.id) && selectedIds.size > 1) {
              const byDir = new Map<string, string[]>()
              for (const s of selectedSnips) {
                const ids = byDir.get(s.dirPath) ?? []
                ids.push(s.id)
                byDir.set(s.dirPath, ids)
              }
              for (const [dirPath, ids] of byDir) await bulkAddTag(dirPath, ids, name)
            } else {
              await addTag(contextMenu.snip.dirPath, contextMenu.snip.id, name)
            }
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Tag Manager popover */}
      {tagManagerOpen && (
        <SnipTagManager
          defs={tagDefs}
          anchorRef={tagManagerBtnRef}
          onCreate={handleCreateDef}
          onDelete={handleDeleteDef}
          onRename={handleRenameDef}
          onRecolor={recolorDef}
          onClose={() => setTagManagerOpen(false)}
        />
      )}

      {/* Tag Assigner sidebar */}
      {tagAssignerOpen && selectedSnips.length > 0 && (
        <SnipTagAssigner
          defs={tagDefs}
          selectedSnips={selectedSnips}
          onBulkAdd={bulkAddTag}
          onBulkRemove={bulkRemoveTag}
          onClose={() => setTagAssignerOpen(false)}
        />
      )}

      {/* Footer */}
      <div className="flex h-6 shrink-0 items-center border-t border-[#eee8d5] bg-[#fdf6e3] px-3 dark:border-[#073642] dark:bg-[#002b36]">
        <span className="text-[10px] text-[#93a1a1] dark:text-[#586e75]">
          {filteredSnips.length} snip{filteredSnips.length !== 1 ? 's' : ''}
          {filteredSnips.length !== snips.length && ` of ${snips.length} total`}
        </span>
      </div>

      {/* Loop overlay */}
      {loopOpen && (
        <div className="absolute inset-0 z-40 flex flex-col bg-[#fdf6e3] dark:bg-[#002b36]">
          <div className="flex shrink-0 items-center gap-2 border-b border-[#eee8d5] bg-[#fdf6e3] px-3 dark:border-[#073642] dark:bg-[#002b36]">
            <button
              onClick={() => setLoopOpen(false)}
              className="shrink-0 rounded p-1.5 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
              aria-label="Back to snips"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
            <div className="flex-1" />
            <PomodoroTimer zenMode={false} />
          </div>
          <LoopCarousel
            snips={filteredSnips}
            xp={0}
            onIncrementXp={async () => 0}
            onIncrementXpForSnip={incrementXpForSnip}
            onExit={() => setLoopOpen(false)}
            shuffled={false}
            noXp={true}
            pathMap={pathMap}
          />
        </div>
      )}

      {/* View carousel overlay */}
      {viewStartIndex !== null && (
        <div className="absolute inset-0 z-40 flex flex-col bg-[#fdf6e3] dark:bg-[#002b36]">
          <div className="flex shrink-0 items-center gap-2 border-b border-[#eee8d5] bg-[#fdf6e3] px-3 dark:border-[#073642] dark:bg-[#002b36]">
            <button
              onClick={() => setViewStartIndex(null)}
              className="shrink-0 rounded p-1.5 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
              aria-label="Back to snips"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
            <div className="flex-1" />
            <PomodoroTimer zenMode={false} />
          </div>
          <LoopCarousel
            snips={filteredSnips}
            xp={0}
            onIncrementXp={async () => 0}
            onExit={() => setViewStartIndex(null)}
            shuffled={false}
            viewMode={true}
            initialIndex={viewStartIndex}
            pathMap={pathMap}
          />
        </div>
      )}
    </div>
  )
}

// Extracted context menu with tag checkboxes, rename, delete
function ContextMenu({
  x, y, snip, tagDefs, bulkSnips,
  onView, onExpand, onNavigate, onRename, onDelete, onAddTag, onRemoveTag, onCreateTag, onClose,
}: {
  x: number
  y: number
  snip: SnipWithDir
  tagDefs: { name: string; color: string }[]
  bulkSnips: SnipWithDir[] | null
  onView: () => void
  onExpand: () => void
  onNavigate: () => void
  onRename: () => void
  onDelete: () => void
  onAddTag: (tag: string) => void
  onRemoveTag: (tag: string) => void
  onCreateTag: (name: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [newTagName, setNewTagName] = useState('')
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - rect.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - rect.height - 4)),
    })
  }, [x, y])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
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

  const snipTags = new Set(snip.tags)

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 max-h-[80vh] min-w-[180px] overflow-y-auto rounded-md border border-[#eee8d5] bg-[#fdf6e3] py-1 shadow-lg dark:border-[#073642] dark:bg-[#073642]"
      style={pos ? { left: pos.left, top: pos.top } : { left: x, top: y, opacity: 0 }}
    >
      <button
        onClick={onView}
        className="block w-full px-3 py-1.5 text-left text-sm text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#002b36]/50"
      >
        View
      </button>
      <button
        onClick={onExpand}
        className="block w-full px-3 py-1.5 text-left text-sm text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#002b36]/50"
      >
        Expand
      </button>
      <button
        onClick={onNavigate}
        className="block w-full px-3 py-1.5 text-left text-sm text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#002b36]/50"
      >
        Open in reader
      </button>
      <button
        onClick={onRename}
        className="block w-full px-3 py-1.5 text-left text-sm text-[#586e75] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#002b36]/50"
      >
        Rename
      </button>
      <button
        onClick={onDelete}
        className="block w-full px-3 py-1.5 text-left text-sm text-[#dc322f] hover:bg-[#eee8d5] dark:hover:bg-[#002b36]/50"
      >
        Delete
      </button>

      <div className="border-t border-[#eee8d5] py-1 dark:border-[#073642]">
        <p className="px-3 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#93a1a1] dark:text-[#657b83]">
          {bulkSnips ? `Tag ${bulkSnips.length} snips` : 'Tags'}
        </p>
        {tagDefs.map((def) => {
          const assigned = snipTags.has(def.name)
          return (
            <label
              key={def.name}
              className="flex cursor-pointer items-center gap-2 px-3 py-1 hover:bg-[#eee8d5] dark:hover:bg-[#002b36]/50"
            >
              <input
                type="checkbox"
                checked={assigned}
                onChange={() => assigned ? onRemoveTag(def.name) : onAddTag(def.name)}
                className="accent-[#268bd2]"
              />
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: def.color }} />
              <span className="text-sm text-[#586e75] dark:text-[#93a1a1]">{def.name}</span>
            </label>
          )
        })}
        <div className="px-3 pt-1">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const name = newTagName.trim()
                if (name) {
                  onCreateTag(name)
                  setNewTagName('')
                }
              }
              if (e.key !== 'Escape') e.stopPropagation()
            }}
            placeholder="New tag…"
            className="h-6 w-full rounded border border-[#93a1a1]/30 bg-transparent px-2 text-xs text-[#073642] outline-none focus:border-[#268bd2] dark:text-[#eee8d5] dark:focus:border-[#268bd2]"
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
