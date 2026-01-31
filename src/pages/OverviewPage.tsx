import { useTextbooks } from '../hooks/useTextbooks'
import { useProgress } from '../hooks/useProgress'
import { useStarred } from '../hooks/useStarred'
import { TileGrid } from '../components/TileGrid'
import { BookTile } from '../components/BookTile'

export function OverviewPage() {
  const textbooks = useTextbooks()
  const { progress, update } = useProgress()
  const { starred, toggle } = useStarred()

  if (textbooks.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        <p>
          No textbooks found. Drop PDF files into{' '}
          <code className="rounded bg-gray-200 px-1">public/textbooks/</code>{' '}
          to get started.
        </p>
      </div>
    )
  }

  const starredBooks = textbooks.filter((b) => starred[b.slug])
  const otherBooks = textbooks.filter((b) => !starred[b.slug])

  const renderTile = (book: (typeof textbooks)[number]) => (
    <BookTile
      key={book.slug}
      slug={book.slug}
      title={book.title}
      file={book.file}
      progress={progress[book.slug]}
      starred={!!starred[book.slug]}
      onToggleStar={toggle}
      onTotalPages={(total) => {
        if (!progress[book.slug]?.totalPages) {
          update(book.slug, { totalPages: total })
        }
      }}
    />
  )

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900">Axiomatic</h1>
      </header>
      {starredBooks.length > 0 && (
        <section>
          <h2 className="px-4 pt-4 text-sm font-medium text-gray-500">
            Starred
          </h2>
          <TileGrid>{starredBooks.map(renderTile)}</TileGrid>
        </section>
      )}
      <section>
        {starredBooks.length > 0 && (
          <h2 className="px-4 pt-2 text-sm font-medium text-gray-500">
            All Books
          </h2>
        )}
        <TileGrid>{otherBooks.map(renderTile)}</TileGrid>
      </section>
    </div>
  )
}
