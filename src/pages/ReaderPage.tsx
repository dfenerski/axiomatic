import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { EditorView } from '@codemirror/view'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useTextbooks } from '../hooks/useTextbooks'
import { useProgress } from '../hooks/useProgress'
import { useNotes } from '../hooks/useNotes'
import { useVimReader } from '../hooks/useVimReader'
import { useSearch } from '../hooks/useSearch'
import { PdfViewer } from '../components/PdfViewer'
import { ReaderToolbar } from '../components/ReaderToolbar'
import { NotesPanel } from '../components/NotesPanel'

export function ReaderPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { textbooks, loading } = useTextbooks()
  const { progress, update } = useProgress()
  const { getNote, setNote } = useNotes()
  const book = textbooks.find((b) => b.slug === slug)
  const bookProgress = slug ? progress[slug] : undefined

  const [currentPage, setCurrentPage] = useState(bookProgress?.currentPage ?? 1)
  const [totalPages, setTotalPages] = useState(bookProgress?.totalPages ?? 0)
  const [zoom, setZoom] = useState(1)
  const [notesOpen, setNotesOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null)
  const [scrollRequest, setScrollRequest] = useState<{ page: number; seq: number } | null>(null)
  const [savedProgressPage, setSavedProgressPage] = useState<number | null>(null)
  const [notesPaneWidth, setNotesPaneWidth] = useState(384)
  const scrollSeq = useRef(0)
  const pdfContainerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<EditorView | null>(null)

  const handleBack = useCallback(() => navigate('/'), [navigate])
  const { activePane } = useVimReader({ pdfContainerRef, notesOpen, setNotesOpen, editorRef, zoom, onZoomChange: setZoom, onBack: handleBack })
  const search = useSearch(pdfDocument)

  const currentPageRef = useRef(currentPage)
  const totalPagesRef = useRef(totalPages)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Scroll to match page when navigating matches
  useEffect(() => {
    if (search.currentMatchPage > 0) {
      setSavedProgressPage((prev) => prev ?? currentPageRef.current)
      scrollSeq.current += 1
      setScrollRequest({ page: search.currentMatchPage, seq: scrollSeq.current })
    }
  }, [search.currentMatchPage, search.currentIndex])

  // Ctrl+F / Cmd+F to toggle search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Clear search when closing
  const handleToggleSearch = useCallback(() => {
    setSearchOpen((o) => {
      if (o) {
        search.setQuery('')
        setSavedProgressPage(null)
      }
      return !o
    })
  }, [search])

  // Back to the page the user was reading before search navigation
  const handleBackToProgress = useCallback(() => {
    if (savedProgressPage == null) return
    scrollSeq.current += 1
    setScrollRequest({ page: savedProgressPage, seq: scrollSeq.current })
    setSavedProgressPage(null)
  }, [savedProgressPage])

  // Save progress on unmount — only if the PDF actually loaded
  const savedProgressPageRef = useRef(savedProgressPage)
  useEffect(() => {
    savedProgressPageRef.current = savedProgressPage
  }, [savedProgressPage])
  const hasLoadedRef = useRef(false)
  useEffect(() => {
    if (book && totalPages > 0) hasLoadedRef.current = true
  }, [book, totalPages])
  useEffect(() => {
    return () => {
      if (slug && hasLoadedRef.current) {
        update(slug, {
          currentPage: savedProgressPageRef.current ?? currentPageRef.current,
          totalPages: totalPagesRef.current,
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  const handleResizeMouseDown = useCallback((e: ReactMouseEvent) => {
    e.preventDefault()
    const onMouseMove = (ev: globalThis.MouseEvent) => {
      const newWidth = Math.min(800, Math.max(240, window.innerWidth - ev.clientX))
      setNotesPaneWidth(newWidth)
    }
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page)
      if (savedProgressPage != null) return
      currentPageRef.current = page
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
    [slug, update, savedProgressPage],
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

  const handlePdfLoaded = useCallback((pdf: PDFDocumentProxy) => {
    setPdfDocument(pdf)
  }, [])

  if (!book) {
    if (loading) {
      return (
        <div className="flex flex-1 items-center justify-center bg-[#fdf6e3] dark:bg-[#002b36]">
          <p className="text-[#657b83] dark:text-[#93a1a1]">Loading...</p>
        </div>
      )
    }
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[#657b83] dark:bg-[#002b36] dark:text-[#93a1a1]">
        <p>Book not found.</p>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-[#268bd2] underline dark:text-[#268bd2]"
        >
          Go back
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <div className={`flex min-w-0 flex-1 flex-col ${activePane === 'pdf' ? 'border-t-2 border-[#268bd2]' : 'border-t-2 border-[#eee8d5] dark:border-[#073642]'}`}>
          <PdfViewer
            file={convertFileSrc(book.full_path)}
            initialPage={bookProgress?.currentPage ?? 1}
            zoom={zoom}
            onPageChange={handlePageChange}
            onTotalPages={handleTotalPages}
            containerRef={pdfContainerRef}
            searchMatches={search.searchMatches}
            currentMatchIndex={search.currentIndex}
            onPdfLoaded={handlePdfLoaded}
            scrollRequest={scrollRequest}
          />
        </div>
        {notesOpen && slug && (
          <>
            <div
              className="w-1.5 shrink-0 cursor-col-resize bg-[#eee8d5] hover:bg-[#268bd2] active:bg-[#268bd2] dark:bg-[#073642] dark:hover:bg-[#268bd2] dark:active:bg-[#268bd2]"
              onMouseDown={handleResizeMouseDown}
            />
            <div className={`flex h-full min-h-0 flex-col ${activePane === 'notes' ? 'border-t-2 border-[#268bd2]' : 'border-t-2 border-[#eee8d5] dark:border-[#073642]'}`}>
              <NotesPanel
                slug={slug}
                page={currentPage}
                content={getNote(slug, currentPage)}
                onUpdate={setNote}
                externalEditorRef={editorRef}
                width={notesPaneWidth}
              />
            </div>
          </>
        )}
      </div>
      <ReaderToolbar
        title={book.title}
        currentPage={currentPage}
        totalPages={totalPages}
        zoom={zoom}
        onZoomChange={setZoom}
        notesOpen={notesOpen}
        onToggleNotes={() => setNotesOpen((o) => !o)}
        searchOpen={searchOpen}
        onToggleSearch={handleToggleSearch}
        searchQuery={search.query}
        onSearchQueryChange={search.setQuery}
        searchCurrentIndex={search.currentIndex}
        searchTotalMatches={search.totalMatches}
        onSearchNext={search.nextMatch}
        onSearchPrev={search.prevMatch}
        savedProgressPage={savedProgressPage}
        onBackToProgress={handleBackToProgress}
      />
    </div>
  )
}
