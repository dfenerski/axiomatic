import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTextbooks } from '../hooks/useTextbooks'
import { useProgress } from '../hooks/useProgress'
import { useStarred } from '../hooks/useStarred'
import { useVimOverview } from '../hooks/useVimOverview'
import { TileGrid } from '../components/TileGrid'
import { BookTile } from '../components/BookTile'
import { ContextMenu } from '../components/ContextMenu'
import type { MenuItem } from '../components/ContextMenu'
import { ThemeToggle } from '../components/ThemeToggle'

interface MenuState {
  x: number
  y: number
  slug: string
}

export function OverviewPage() {
  const textbooks = useTextbooks()
  const { progress, update } = useProgress()
  const { starred, toggle } = useStarred()
  const gridRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')
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
            action: () => {
              const newName = prompt('New name:', book.title)
              if (!newName || newName.trim() === book.title) return
              fetch('/__textbooks/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file: book.file, newName: newName.trim() }),
              })
            },
          },
          {
            label: 'Delete',
            action: () => {
              if (!confirm(`Delete "${book.title}"?`)) return
              fetch('/__textbooks/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file: book.file }),
              })
            },
          },
        ]
      })()
    : []

  if (textbooks.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500 dark:text-gray-400 dark:bg-gray-900">
        <p>
          No textbooks found. Drop PDF files into{' '}
          <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">public/textbooks/</code>{' '}
          to get started.
        </p>
      </div>
    )
  }

  const renderTile = (book: (typeof textbooks)[number], flatIndex: number) => (
    <BookTile
      key={book.slug}
      slug={book.slug}
      title={book.title}
      file={book.file}
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
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            <img src="/axiomatic.png" alt="" className="h-6 w-6" />
            Axiomatic
          </h1>
          <div className="ml-auto flex items-center gap-1">
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
                  className="h-7 w-48 rounded border border-gray-300 bg-white pl-2 pr-7 text-sm text-gray-800 outline-none focus:border-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-blue-500"
                  autoFocus
                />
                {filterQuery && (
                  <button
                    onClick={() => {
                      setFilterQuery('')
                      filterInputRef.current?.focus()
                    }}
                    className="absolute right-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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
                className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                aria-label="Filter books"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>
      {starredBooks.length > 0 && (
        <section>
          <h2 className="px-4 pt-4 text-sm font-medium text-gray-500 dark:text-gray-400">
            Starred
          </h2>
          <TileGrid gridRef={gridRef}>
            {starredBooks.map((book, i) => renderTile(book, i))}
          </TileGrid>
        </section>
      )}
      <section>
        {starredBooks.length > 0 && (
          <h2 className="px-4 pt-2 text-sm font-medium text-gray-500 dark:text-gray-400">
            All Books
          </h2>
        )}
        <TileGrid gridRef={starredBooks.length === 0 ? gridRef : undefined}>
          {otherBooks.map((book, i) =>
            renderTile(book, starredBooks.length + i),
          )}
        </TileGrid>
      </section>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={closeMenu} />
      )}
    </div>
  )
}
