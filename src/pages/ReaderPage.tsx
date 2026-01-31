import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTextbooks } from '../hooks/useTextbooks'
import { useProgress } from '../hooks/useProgress'
import { useNotes } from '../hooks/useNotes'
import { PdfViewer } from '../components/PdfViewer'
import { ReaderToolbar } from '../components/ReaderToolbar'
import { NotesPanel } from '../components/NotesPanel'

export function ReaderPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const textbooks = useTextbooks()
  const { progress, update } = useProgress()
  const { getNote, setNote } = useNotes()

  const book = textbooks.find((b) => b.slug === slug)
  const bookProgress = slug ? progress[slug] : undefined

  const [currentPage, setCurrentPage] = useState(bookProgress?.currentPage ?? 1)
  const [totalPages, setTotalPages] = useState(bookProgress?.totalPages ?? 0)
  const [zoom, setZoom] = useState(1)
  const [notesOpen, setNotesOpen] = useState(false)

  const currentPageRef = useRef(currentPage)
  const totalPagesRef = useRef(totalPages)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Save progress on unmount
  useEffect(() => {
    return () => {
      if (slug) {
        update(slug, {
          currentPage: currentPageRef.current,
          totalPages: totalPagesRef.current,
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  const handlePageChange = useCallback(
    (page: number) => {
      currentPageRef.current = page
      setCurrentPage(page)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (slug) {
          update(slug, {
            currentPage: page,
            totalPages: totalPagesRef.current,
          })
        }
      }, 300)
    },
    [slug, update],
  )

  const handleTotalPages = useCallback(
    (total: number) => {
      totalPagesRef.current = total
      setTotalPages(total)
      if (slug) {
        update(slug, { totalPages: total })
      }
    },
    [slug, update],
  )

  if (!book) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-gray-500">
        <p>Book not found.</p>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-blue-600 underline"
        >
          Go back
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      <ReaderToolbar
        title={book.title}
        currentPage={currentPage}
        totalPages={totalPages}
        zoom={zoom}
        onZoomChange={setZoom}
        notesOpen={notesOpen}
        onToggleNotes={() => setNotesOpen((o) => !o)}
      />
      <div className="flex min-h-0 flex-1">
        <PdfViewer
          file={`/textbooks/${book.file}`}
          initialPage={bookProgress?.currentPage ?? 1}
          zoom={zoom}
          onPageChange={handlePageChange}
          onTotalPages={handleTotalPages}
        />
        {notesOpen && slug && (
          <NotesPanel
            slug={slug}
            page={currentPage}
            content={getNote(slug, currentPage)}
            onUpdate={setNote}
          />
        )}
      </div>
    </div>
  )
}
