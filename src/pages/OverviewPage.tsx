import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { invoke } from '@tauri-apps/api/core'
import { useTextbooks } from '../hooks/useTextbooks'
import { useDirectories } from '../hooks/useDirectories'
import { useProgress } from '../hooks/useProgress'
import { useStarred } from '../hooks/useStarred'
import { useTags } from '../hooks/useTags'
import { useVimOverview, type NavSection } from '../hooks/useVimOverview'
import { useBatchedRender } from '../hooks/useBatchedRender'
import { useSyncStatus } from '../hooks/useSyncStatus'
import { useSectionCollapse } from '../hooks/useSectionCollapse'
import { TileGrid } from '../components/TileGrid'
import { BookTile } from '../components/BookTile'
import { ContextMenu } from '../components/ContextMenu'
import type { MenuItem } from '../components/ContextMenu'
import { SyncStatus } from '../components/SyncStatus'
import { togglePalette } from '../lib/palette'
import { DirectoryExplorer } from '../components/DirectoryExplorer'
import { TagManager } from '../components/TagManager'
import { TagAssigner } from '../components/TagAssigner'
import { SlugMigrationDialog } from '../components/SlugMigrationDialog'
import type { OrphanCandidate } from '../components/SlugMigrationDialog'

interface MenuState {
  x: number
  y: number
  slug: string
}

export function OverviewPage() {
  const { textbooks, loading, refresh } = useTextbooks()
  const { directories, add: addDir, remove: removeDir } = useDirectories()
  const dirPaths = useMemo(() => directories.map((d) => d.path), [directories])
  const { progress } = useProgress(dirPaths)
  const { starred, toggle } = useStarred(textbooks)
  const { tags, bookTags, createTag, deleteTag, tagBook, untagBook, updateTagColor } = useTags()
  const gridRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { isExpanded, toggle: toggleSection } = useSectionCollapse()

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')
  const [explorerOpen, setExplorerOpen] = useState(false)
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [tagAssignerSlug, setTagAssignerSlug] = useState<string | null>(null)
  const [activeTagFilters, setActiveTagFilters] = useState<Set<number>>(new Set())
  const filterInputRef = useRef<HTMLInputElement>(null)
  const tagBtnRef = useRef<HTMLButtonElement>(null)
  const [orphanCandidates, setOrphanCandidates] = useState<OrphanCandidate[]>([])
  const [showMigrationDialog, setShowMigrationDialog] = useState(false)
  const orphanCheckDone = useRef(false)

  useEffect(() => {
    if (loading || textbooks.length === 0 || orphanCheckDone.current) return
    orphanCheckDone.current = true
    invoke<OrphanCandidate[]>('detect_orphaned_slugs')
      .then((candidates) => {
        if (candidates.length > 0) {
          setOrphanCandidates(candidates)
          setShowMigrationDialog(true)
        }
      })
      .catch((err) => console.error('detect_orphaned_slugs failed:', err))
  }, [loading, textbooks])

  const handleMigrationComplete = useCallback(() => {
    setShowMigrationDialog(false)
    setOrphanCandidates([])
    refresh()
  }, [refresh])

  const matchesFilter = useCallback(
    (title: string, slug: string) => {
      const text = !filterQuery || title.toLowerCase().includes(filterQuery.toLowerCase())
      const tag =
        activeTagFilters.size === 0 ||
        (bookTags[slug] ?? []).some((t) => activeTagFilters.has(t.id))
      return text && tag
    },
    [filterQuery, activeTagFilters, bookTags],
  )

  const { starredBooks, dirSections, slugs, sections } = useMemo(() => {
    const starredBooks = textbooks.filter(
      (b) => starred[b.slug] && matchesFilter(b.title, b.slug),
    )

    // Group non-starred books by directory, preserving directory order
    const dirMap = new Map<number, typeof textbooks>()
    for (const dir of directories) {
      dirMap.set(dir.id, [])
    }
    for (const book of textbooks) {
      if (starred[book.slug] || !matchesFilter(book.title, book.slug)) continue
      const arr = dirMap.get(book.dir_id)
      if (arr) arr.push(book)
    }

    // Sort books within each directory by last-read time
    const dirSections: { dir: (typeof directories)[number]; books: typeof textbooks }[] = []
    for (const dir of directories) {
      const books = dirMap.get(dir.id) ?? []
      if (books.length === 0) continue
      books.sort((a, b) => {
        const aTime = progress[a.slug]?.lastReadAt ?? ''
        const bTime = progress[b.slug]?.lastReadAt ?? ''
        return bTime.localeCompare(aTime)
      })
      dirSections.push({ dir, books })
    }

    // Build flat slug array (only expanded sections) and sections metadata
    const slugs: string[] = []
    const sections: NavSection[] = []

    if (starredBooks.length > 0) {
      const exp = isExpanded('starred')
      sections.push({ key: 'starred', expanded: exp, tileCount: starredBooks.length })
      if (exp) {
        for (const b of starredBooks) slugs.push(b.slug)
      }
    }
    for (const sec of dirSections) {
      const key = `dir-${sec.dir.id}`
      const exp = isExpanded(key)
      sections.push({ key, expanded: exp, tileCount: sec.books.length })
      if (exp) {
        for (const b of sec.books) slugs.push(b.slug)
      }
    }

    return { starredBooks, dirSections, slugs, sections }
  }, [textbooks, directories, starred, matchesFilter, progress, isExpanded])

  const totalItems = slugs.length
  const renderLimit = useBatchedRender(totalItems)
  const syncStatus = useSyncStatus(loading, totalItems, renderLimit)

  const { selectedIndex, selectedHeader } = useVimOverview(slugs, gridRef, sections, toggleSection)

  const handleContextMenu = useCallback(
    (slug: string, x: number, y: number) => {
      setMenu({ x, y, slug })
    },
    [],
  )

  const closeMenu = useCallback(() => setMenu(null), [])

  const handleAddDir = useCallback(async () => {
    const dir = await addDir()
    if (dir) refresh()
  }, [addDir, refresh])

  const handleRemoveDir = useCallback(
    async (id: number) => {
      await removeDir(id)
      refresh()
    },
    [removeDir, refresh],
  )


  const menuItems: MenuItem[] = menu
    ? (() => {
        const book = textbooks.find((b) => b.slug === menu.slug)
        if (!book) return []
        const isStarred = !!starred[book.slug]
        return [
          {
            label: 'Open',
            action: () => navigate(`/read/${book.slug}`),
          },
          {
            label: isStarred ? 'Unstar' : 'Star',
            action: () => toggle(book.slug),
          },
          {
            label: 'Tag',
            action: () => setTagAssignerSlug(book.slug),
          },
          {
            label: 'Rename',
            action: async () => {
              const newName = prompt('New name:', book.title)
              if (!newName || newName.trim() === book.title) return
              try {
                await invoke('rename_textbook', {
                  fullPath: book.full_path,
                  newName: newName.trim(),
                })
                refresh()
              } catch (err) {
                console.error('Rename failed:', err)
              }
            },
          },
          {
            label: 'Delete',
            action: async () => {
              if (!confirm(`Delete "${book.title}"?`)) return
              try {
                await invoke('delete_textbook', { fullPath: book.full_path })
                refresh()
              } catch (err) {
                console.error('Delete failed:', err)
              }
            },
          },
        ]
      })()
    : []

  if (!loading && directories.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#fdf6e3] dark:bg-[#002b36]">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-[#93a1a1] dark:text-[#586e75]">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <p className="text-[#657b83] dark:text-[#93a1a1]">No directories attached</p>
        <button
          onClick={handleAddDir}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          Attach Directory
        </button>
      </div>
    )
  }

  // Precompute section layouts via reduce (pure — no mutable let in render)
  type DirLayout = { sec: typeof dirSections[0]; books: typeof dirSections[0]['books'] | null; flatStart: number; isFirstGrid: boolean; expanded: boolean }
  type Acc = { rem: number; offset: number; gridAssigned: boolean; starred: { books: typeof starredBooks; flatStart: number; isFirstGrid: boolean } | null; dirs: DirLayout[] }

  const initAcc: Acc = { rem: renderLimit, offset: 0, gridAssigned: false, starred: null, dirs: [] }

  // Step 1: starred section
  const afterStarred: Acc = (starredBooks.length > 0 && isExpanded('starred') && initAcc.rem > 0)
    ? {
        ...initAcc,
        rem: initAcc.rem - Math.min(starredBooks.length, initAcc.rem),
        offset: initAcc.offset + starredBooks.length,
        gridAssigned: true,
        starred: { books: starredBooks.slice(0, initAcc.rem), flatStart: initAcc.offset, isFirstGrid: true },
      }
    : initAcc

  // Step 2: dir sections
  const sectionLayouts = dirSections.reduce<Acc>((acc, sec) => {
    const dirKey = `dir-${sec.dir.id}`
    const expanded = isExpanded(dirKey)
    if (expanded && acc.rem > 0) {
      const books = sec.books.slice(0, acc.rem)
      const isFirst = !acc.gridAssigned
      return {
        ...acc,
        rem: acc.rem - books.length,
        offset: acc.offset + sec.books.length,
        gridAssigned: true,
        dirs: [...acc.dirs, { sec, books, flatStart: acc.offset, isFirstGrid: isFirst, expanded }],
      }
    }
    return { ...acc, dirs: [...acc.dirs, { sec, books: null, flatStart: 0, isFirstGrid: false, expanded }] }
  }, afterStarred)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#fdf6e3] dark:bg-[#002b36]">
      <div className="flex h-10 shrink-0 items-center border-b border-[#eee8d5] bg-[#fdf6e3] px-3 dark:border-[#073642] dark:bg-[#002b36]">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          <button
            onClick={() => setExplorerOpen((o) => !o)}
            className="shrink-0 rounded p-1.5 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
            aria-label="Projects"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <Link
            to="/snips"
            className="shrink-0 rounded p-1.5 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
            aria-label="Snips"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </Link>
          <div className="shrink-0">
            <button
              ref={tagBtnRef}
              onClick={() => setTagManagerOpen((o) => !o)}
              className="rounded p-1.5 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
              aria-label="Manage tags"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
            </button>
          </div>
          {tags.length > 0 && (
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
              {tags.map((tag) => {
                const active = activeTagFilters.has(tag.id)
                return (
                  <button
                    key={tag.id}
                    onClick={() =>
                      setActiveTagFilters((prev) => {
                        const next = new Set(prev)
                        if (next.has(tag.id)) next.delete(tag.id)
                        else next.add(tag.id)
                        return next
                      })
                    }
                    className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                      active
                        ? 'text-white'
                        : 'text-[#586e75] dark:text-[#93a1a1] opacity-60 hover:opacity-100'
                    }`}
                    style={active ? { backgroundColor: tag.color } : undefined}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 pl-1">
          {filterOpen ? (
            <div className="relative flex shrink-0 items-center">
              <input
                ref={filterInputRef}
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setFilterQuery('')
                    setFilterOpen(false)
                  }
                }}
                placeholder="Filter books…"
                className="h-7 w-48 rounded border border-[#93a1a1] bg-[#fdf6e3] pl-2 pr-7 text-sm text-[#073642] outline-none focus:border-blue-400 dark:border-[#073642] dark:bg-[#073642] dark:text-[#eee8d5] dark:focus:border-[#268bd2]"
                autoFocus
              />
              {filterQuery && (
                <button
                  onClick={() => {
                    setFilterQuery('')
                    filterInputRef.current?.focus()
                  }}
                  className="absolute right-1.5 text-[#93a1a1] hover:text-[#586e75] dark:hover:text-[#93a1a1]"
                  aria-label="Clear filter"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => setFilterOpen(true)}
              className="shrink-0 rounded p-1.5 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
              aria-label="Filter books"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          )}
          <button
            onClick={togglePalette}
            className="shrink-0 rounded p-1.5 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
            aria-label="Command palette"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
            </svg>
          </button>
          <SyncStatus {...syncStatus} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <p className="text-[#657b83] dark:text-[#93a1a1]">Loading...</p>
        </div>
      ) : (<>
      {starredBooks.length > 0 && (
        <section>
          <button
            onClick={() => toggleSection('starred')}
            className={`sticky top-0 z-10 flex w-full items-center gap-1 px-4 py-2 text-base font-semibold border-b border-[#eee8d5] dark:border-[#073642] text-[#586e75] dark:text-[#93a1a1]${selectedHeader === 'starred' ? ' border-l-2 border-l-[#268bd2] bg-[#eee8d5] dark:bg-[#073642]' : ' border-l-2 border-l-transparent bg-[#fdf6e3] dark:bg-[#002b36]'}`}
            data-section-key="starred"
            {...(selectedHeader === 'starred' ? { 'data-header-selected': true } : {})}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 transition-transform" style={{ transform: isExpanded('starred') ? 'rotate(90deg)' : undefined }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span>Starred</span>
            <span className="text-xs opacity-60">({starredBooks.length})</span>
          </button>
          {sectionLayouts.starred && (
              <TileGrid gridRef={sectionLayouts.starred.isFirstGrid ? gridRef : undefined}>
                {sectionLayouts.starred.books.map((book, i) => (
                    <BookTile
                      key={book.slug}
                      slug={book.slug}
                      title={book.title}
                      fullPath={book.full_path}
                      progress={progress[book.slug]}
                      starred={!!starred[book.slug]}
                      selected={selectedIndex === sectionLayouts.starred!.flatStart + i}
                      onToggleStar={toggle}
                      onContextMenu={handleContextMenu}
                      tags={bookTags[book.slug]}
                    />
                ))}
              </TileGrid>
          )}
        </section>
      )}
      {sectionLayouts.dirs.map(({ sec, books: booksToShow, flatStart, isFirstGrid, expanded }) => {
        const dirKey = `dir-${sec.dir.id}`
        return (
          <section key={sec.dir.id}>
            <button
              onClick={() => toggleSection(dirKey)}
              className={`sticky top-0 z-10 flex w-full items-center gap-1 px-4 py-2 text-base font-semibold border-b border-[#eee8d5] dark:border-[#073642] text-[#586e75] dark:text-[#93a1a1]${selectedHeader === dirKey ? ' border-l-2 border-l-[#268bd2] bg-[#eee8d5] dark:bg-[#073642]' : ' border-l-2 border-l-transparent bg-[#fdf6e3] dark:bg-[#002b36]'}`}
              data-section-key={dirKey}
              {...(selectedHeader === dirKey ? { 'data-header-selected': true } : {})}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 transition-transform" style={{ transform: expanded ? 'rotate(90deg)' : undefined }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span>{sec.dir.label}</span>
              <span className="text-xs opacity-60">({sec.books.length})</span>
            </button>
            {booksToShow && (
              <TileGrid gridRef={isFirstGrid ? gridRef : undefined}>
                {booksToShow.map((book, i) => (
                  <BookTile
                    key={book.slug}
                    slug={book.slug}
                    title={book.title}
                    fullPath={book.full_path}
                    progress={progress[book.slug]}
                    starred={!!starred[book.slug]}
                    selected={selectedIndex === flatStart + i}
                    onToggleStar={toggle}
                    onContextMenu={handleContextMenu}
                    tags={bookTags[book.slug]}
                  />
                ))}
              </TileGrid>
            )}
          </section>
        )
      })}
      {textbooks.length === 0 && directories.length > 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-[#93a1a1] dark:text-[#657b83]">
          <p className="text-sm">No PDFs found in attached directories.</p>
        </div>
      )}
      </>)}
      </div>
      {tagManagerOpen && (
        <TagManager
          tags={tags}
          anchorRef={tagBtnRef}
          onCreate={createTag}
          onDelete={deleteTag}
          onUpdateColor={updateTagColor}
          onClose={() => setTagManagerOpen(false)}
        />
      )}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={closeMenu} />
      )}
      {explorerOpen && (
        <DirectoryExplorer
          directories={directories}
          textbooks={textbooks}
          onAdd={handleAddDir}
          onRemove={handleRemoveDir}
          onClose={() => setExplorerOpen(false)}
        />
      )}
      {tagAssignerSlug && (() => {
        const book = textbooks.find((b) => b.slug === tagAssignerSlug)
        if (!book) return null
        return (
          <TagAssigner
            slug={book.slug}
            title={book.title}
            tags={tags}
            bookTags={bookTags[book.slug] ?? []}
            onTag={tagBook}
            onUntag={untagBook}
            onClose={() => setTagAssignerSlug(null)}
          />
        )
      })()}
      {showMigrationDialog && orphanCandidates.length > 0 && (
        <SlugMigrationDialog
          candidates={orphanCandidates}
          onComplete={handleMigrationComplete}
        />
      )}
    </div>
  )
}
