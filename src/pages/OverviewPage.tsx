import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { invoke } from '@tauri-apps/api/core'
import { useTextbooks } from '../hooks/useTextbooks'
import { useDirectories } from '../hooks/useDirectories'
import { useProgress } from '../hooks/useProgress'
import { useStarred } from '../hooks/useStarred'
import { useVimOverview } from '../hooks/useVimOverview'
import { TileGrid } from '../components/TileGrid'
import { BookTile } from '../components/BookTile'
import { ContextMenu } from '../components/ContextMenu'
import type { MenuItem } from '../components/ContextMenu'
import { ThemeToggle } from '../components/ThemeToggle'
import { DirectoryExplorer } from '../components/DirectoryExplorer'

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
  const gridRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')
  const [explorerOpen, setExplorerOpen] = useState(false)
  const filterInputRef = useRef<HTMLInputElement>(null)

  const matchesFilter = (title: string) =>
    !filterQuery || title.toLowerCase().includes(filterQuery.toLowerCase())

  const starredBooks = textbooks.filter((b) => starred[b.slug] && matchesFilter(b.title))
  const otherBooks = textbooks
    .filter((b) => !starred[b.slug] && matchesFilter(b.title))
    .sort((a, b) => {
      const aTime = progress[a.slug]?.lastReadAt ?? ''
      const bTime = progress[b.slug]?.lastReadAt ?? ''
      return bTime.localeCompare(aTime)
    })
  const slugs = [...starredBooks, ...otherBooks].map((b) => b.slug)

  const { selectedIndex } = useVimOverview(slugs, gridRef, starredBooks.length)

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

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#fdf6e3] dark:bg-[#002b36]">
        <p className="text-[#657b83] dark:text-[#93a1a1]">Loading...</p>
      </div>
    )
  }

  const renderTile = (book: (typeof textbooks)[number], flatIndex: number) => (
    <BookTile
      key={book.slug}
      slug={book.slug}
      title={book.title}
      fullPath={book.full_path}
      progress={progress[book.slug]}
      starred={!!starred[book.slug]}
      selected={selectedIndex === flatIndex}
      onToggleStar={toggle}
      onContextMenu={handleContextMenu}
      onTotalPages={(total) => {
        if (!progress[book.slug]?.totalPages) {
          update(book.slug, { totalPages: total })
        }
      }}
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#fdf6e3] dark:bg-[#002b36]">
      <div className="min-h-0 flex-1 overflow-y-auto">
      {starredBooks.length > 0 && (
        <section>
          <h2 className="px-4 pt-4 text-sm font-medium text-[#657b83] dark:text-[#93a1a1]">
            Starred
          </h2>
          <TileGrid gridRef={gridRef}>
            {starredBooks.map((book, i) => renderTile(book, i))}
          </TileGrid>
        </section>
      )}
      <section>
        {starredBooks.length > 0 && (
          <h2 className="px-4 pt-2 text-sm font-medium text-[#657b83] dark:text-[#93a1a1]">
            All Books
          </h2>
        )}
        <TileGrid gridRef={starredBooks.length === 0 ? gridRef : undefined}>
          {otherBooks.map((book, i) =>
            renderTile(book, starredBooks.length + i),
          )}
        </TileGrid>
      </section>
      {textbooks.length === 0 && directories.length > 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-[#93a1a1] dark:text-[#657b83]">
          <p className="text-sm">No PDFs found in attached directories.</p>
        </div>
      )}
      </div>
      <footer className="flex h-10 shrink-0 items-center gap-1 border-t border-[#eee8d5] bg-[#fdf6e3] px-3 dark:border-[#073642] dark:bg-[#002b36]">
        {filterOpen ? (
          <div className="relative flex items-center">
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
            className="rounded p-1.5 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
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
          className="rounded p-1.5 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
          aria-label="Library sources"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        <ThemeToggle />
      </footer>
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
    </div>
  )
}
