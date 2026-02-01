import { useCallback, useMemo, useRef, useState, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { invoke } from '@tauri-apps/api/core'
import { useTextbooks } from '../hooks/useTextbooks'
import { useDirectories } from '../hooks/useDirectories'
import { useProgress } from '../hooks/useProgress'
import { useStarred } from '../hooks/useStarred'
import { useTags } from '../hooks/useTags'
import { useVimOverview } from '../hooks/useVimOverview'
import { useBatchedRender } from '../hooks/useBatchedRender'
import { useSyncStatus } from '../hooks/useSyncStatus'
import { TileGrid } from '../components/TileGrid'
import { BookTile } from '../components/BookTile'
import { ContextMenu } from '../components/ContextMenu'
import type { MenuItem } from '../components/ContextMenu'
import { ThemeToggle } from '../components/ThemeToggle'
import { SyncStatus } from '../components/SyncStatus'
import { DirectoryExplorer } from '../components/DirectoryExplorer'
import { TagManager } from '../components/TagManager'
import { TagAssigner } from '../components/TagAssigner'

interface MenuState {
  x: number
  y: number
  slug: string
}

export function OverviewPage() {
  const { textbooks, loading, refresh } = useTextbooks()
  const { directories, add: addDir, remove: removeDir } = useDirectories()
  const { progress, update } = useProgress()
  const { starred, toggle } = useStarred()
  const { tags, bookTags, createTag, deleteTag, tagBook, untagBook, updateTagColor } = useTags()
  const gridRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')
  const [explorerOpen, setExplorerOpen] = useState(false)
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [tagAssignerSlug, setTagAssignerSlug] = useState<string | null>(null)
  const [activeTagFilters, setActiveTagFilters] = useState<Set<number>>(new Set())
  const filterInputRef = useRef<HTMLInputElement>(null)
  const tagBtnRef = useRef<HTMLButtonElement>(null)

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

  const { starredBooks, dirSections, slugs, sectionSizes } = useMemo(() => {
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

    // Build flat slug array and section sizes
    const slugs: string[] = []
    const sectionSizes: number[] = []

    if (starredBooks.length > 0) {
      sectionSizes.push(starredBooks.length)
      for (const b of starredBooks) slugs.push(b.slug)
    }
    for (const sec of dirSections) {
      sectionSizes.push(sec.books.length)
      for (const b of sec.books) slugs.push(b.slug)
    }

    return { starredBooks, dirSections, slugs, sectionSizes }
  }, [textbooks, directories, starred, matchesFilter, progress])

  const totalItems = slugs.length
  const renderLimit = useBatchedRender(totalItems)
  const syncStatus = useSyncStatus(loading, totalItems, renderLimit)

  const { selectedIndex } = useVimOverview(slugs, gridRef, sectionSizes)

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

  // Stable callback for onTotalPages — use ref to avoid depending on progress
  const progressRef = useRef(progress) as RefObject<typeof progress>
  progressRef.current = progress
  const handleTotalPages = useCallback(
    (slug: string, total: number) => {
      if (!progressRef.current[slug]?.totalPages) {
        update(slug, { totalPages: total })
      }
    },
    [update],
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

  // Progressive rendering: track how many items we've emitted across sections
  let remaining = renderLimit
  let flatOffset = 0
  let gridRefAssigned = false

  const getGridRef = () => {
    if (!gridRefAssigned) {
      gridRefAssigned = true
      return gridRef
    }
    return undefined
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#fdf6e3] dark:bg-[#002b36]">
      <div className="min-h-0 flex-1 overflow-y-auto">
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <p className="text-[#657b83] dark:text-[#93a1a1]">Loading...</p>
        </div>
      ) : (<>
      {starredBooks.length > 0 && remaining > 0 && (
        <section>
          <h2 className="px-4 pt-4 text-sm font-medium text-[#657b83] dark:text-[#93a1a1]">
            Starred
          </h2>
          <TileGrid gridRef={getGridRef()}>
            {starredBooks.slice(0, remaining).map((book, i) => {
              const idx = flatOffset + i
              return (
                <BookTile
                  key={book.slug}
                  slug={book.slug}
                  title={book.title}
                  fullPath={book.full_path}
                  progress={progress[book.slug]}
                  starred={!!starred[book.slug]}
                  selected={selectedIndex === idx}
                  onToggleStar={toggle}
                  onContextMenu={handleContextMenu}
                  onTotalPages={handleTotalPages}
                  tags={bookTags[book.slug]}
                />
              )
            })}
          </TileGrid>
          {(() => {
            const shown = Math.min(starredBooks.length, remaining)
            remaining -= shown
            flatOffset += starredBooks.length
            return null
          })()}
        </section>
      )}
      {dirSections.map((sec) => {
        if (remaining <= 0) {
          flatOffset += sec.books.length
          return null
        }
        const sectionStart = flatOffset
        const booksToShow = sec.books.slice(0, remaining)
        remaining -= booksToShow.length
        flatOffset += sec.books.length
        return (
          <section key={sec.dir.id}>
            <h2 className="px-4 pt-4 text-sm font-medium text-[#657b83] dark:text-[#93a1a1]">
              {sec.dir.label}
            </h2>
            <TileGrid gridRef={getGridRef()}>
              {booksToShow.map((book, i) => (
                <BookTile
                  key={book.slug}
                  slug={book.slug}
                  title={book.title}
                  fullPath={book.full_path}
                  progress={progress[book.slug]}
                  starred={!!starred[book.slug]}
                  selected={selectedIndex === sectionStart + i}
                  onToggleStar={toggle}
                  onContextMenu={handleContextMenu}
                  onTotalPages={handleTotalPages}
                  tags={bookTags[book.slug]}
                />
              ))}
            </TileGrid>
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
      <footer className="flex h-10 shrink-0 items-center border-t border-[#eee8d5] bg-[#fdf6e3] px-3 dark:border-[#073642] dark:bg-[#002b36]">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
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
            onClick={() => setExplorerOpen((o) => !o)}
            className="shrink-0 rounded p-1.5 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
            aria-label="Library sources"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </button>
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
          <ThemeToggle />
          <SyncStatus {...syncStatus} />
        </div>
      </footer>
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
    </div>
  )
}
