import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { EditorView } from '@codemirror/view'
import { useTextbooks } from '../hooks/useTextbooks'
import { useProgress } from '../hooks/useProgress'
import { useNotes } from '../hooks/useNotes'
import { useVimReader } from '../hooks/useVimReader'
import { useSearch } from '../hooks/useSearch'
import { useDocument } from '../hooks/useDocument'
import { useHighlights } from '../hooks/useHighlights'
import { useSnips } from '../hooks/useSnips'
import { useTabNavigation } from '../hooks/useTabs'
import { PdfViewer, type PdfViewerHandle } from '../components/PdfViewer'
import { TabBar } from '../components/TabBar'
import { ReaderToolbar } from '../components/ReaderToolbar'
import { NotesPanel } from '../components/NotesPanel'
import { OutlineSidebar } from '../components/OutlineSidebar'
import { HighlightsPanel } from '../components/HighlightsPanel'
import { BookmarksPanel } from '../components/BookmarksPanel'
import { SnipBanner } from '../components/SnipBanner'
import { setReaderSnipMode, setReaderHasSnips } from '../lib/readerState'

export function ReaderPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { textbooks, loading } = useTextbooks()
  const { getNote, setNote } = useNotes()
  const book = textbooks.find((b) => b.slug === slug)
  const dirPaths = useMemo(() => (book ? [book.dir_path] : []), [book?.dir_path])
  const { progress, update } = useProgress(dirPaths)
  const bookProgress = slug ? progress[slug] : undefined
  const dirPathRef = useRef(book?.dir_path ?? '')
  useEffect(() => {
    if (book?.dir_path) dirPathRef.current = book.dir_path
  }, [book?.dir_path])

  const { docInfo, loading: docLoading, error: docError } = useDocument(book?.full_path)
  const { colorHighlights, bookmarkHighlights, highlightsForPage, createHighlight, deleteHighlight, deleteHighlightGroup } = useHighlights(slug)
  const { snips, addSnip } = useSnips(slug, book?.dir_path)
  const { tabs, openTab, reopenTab, tabsRef, selectTab, closeTabAndNavigate, closeOtherTabsAndNavigate } = useTabNavigation(slug)

  const [snipMode, setSnipMode] = useState(false)
  const [snipToast, setSnipToast] = useState<string | null>(null)
  const [pendingSnip, setPendingSnip] = useState<{ page: number; x: number; y: number; w: number; h: number } | null>(null)
  const sessionSnipCount = useRef(0)
  const snipModeRef = useRef(false)

  useEffect(() => { setReaderHasSnips(snips.length > 0) }, [snips])
  useEffect(() => { setReaderSnipMode(snipMode) }, [snipMode])
  useEffect(() => {
    return () => { setReaderSnipMode(false); setReaderHasSnips(false) }
  }, [])

  // Register this book as a tab
  useEffect(() => {
    if (book && slug) {
      openTab({ slug, title: book.title, fullPath: book.full_path, route: `/read/${slug}` })
    }
  }, [book, slug, openTab])


  // Capture initial page once per document — don't re-evaluate when progress
  // updates during scroll, as that would bust PdfViewer's React.memo every 300ms.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableInitialPage = useMemo(() => bookProgress?.currentPage ?? 1, [slug])

  const [currentPage, setCurrentPage] = useState(bookProgress?.currentPage ?? 1)
  const totalPages = docInfo?.page_count ?? bookProgress?.totalPages ?? 0
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  const pdfViewerRef = useRef<PdfViewerHandle>(null)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [highlightsOpen, setHighlightsOpen] = useState(false)
  const [highlightsPaneWidth, setHighlightsPaneWidth] = useState(280)
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [bookmarksPaneWidth, setBookmarksPaneWidth] = useState(280)
  const [zenMode, setZenMode] = useState(false)
  const [scrollRequest, setScrollRequest] = useState<{ page: number; seq: number } | null>(null)
  const [savedProgressPage, setSavedProgressPage] = useState<number | null>(null)
  const [outlinePaneWidth, setOutlinePaneWidth] = useState(200)
  const [notesPaneWidth, setNotesPaneWidth] = useState(384)
  const scrollSeq = useRef(0)
  const pdfContainerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<EditorView | null>(null)

  const zoomDisplayTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const snipToastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const handleBack = useCallback(() => navigate('/'), [navigate])
  const handleZoomChange = useCallback((newZoom: number) => {
    zoomRef.current = newZoom
    pdfViewerRef.current?.applyZoom(newZoom)
    // Debounce the React state update — only the toolbar percentage needs it
    clearTimeout(zoomDisplayTimerRef.current)
    zoomDisplayTimerRef.current = setTimeout(() => setZoom(newZoom), 150)
  }, [])
  const { activePane } = useVimReader({ pdfContainerRef, notesOpen, setNotesOpen, editorRef, zoomRef, onZoomChange: handleZoomChange, onBack: handleBack })

  // Stable snip mode callbacks (only use refs + state setters → safe with [] deps)
  const exitSnipMode = useCallback(() => {
    const n = sessionSnipCount.current
    snipModeRef.current = false
    setSnipMode(false)
    setPendingSnip(null)
    const msg = n > 0 ? `${n} snip${n === 1 ? '' : 's'} saved` : 'Snip mode off'
    setSnipToast(msg)
    clearTimeout(snipToastTimerRef.current)
    snipToastTimerRef.current = setTimeout(() => setSnipToast(null), 2000)
  }, [])

  const enterSnipMode = useCallback(() => {
    sessionSnipCount.current = 0
    snipModeRef.current = true
    setSnipMode(true)
  }, [])

  const handleSnipRegion = useCallback((page: number, x: number, y: number, w: number, h: number) => {
    setPendingSnip({ page, x, y, w, h })
  }, [])

  const handleSnipSave = useCallback(async (label: string) => {
    if (!pendingSnip || !book) return
    const snip = await addSnip(book.full_path, pendingSnip.page, label, pendingSnip.x, pendingSnip.y, pendingSnip.w, pendingSnip.h)
    if (snip) sessionSnipCount.current += 1
    setPendingSnip(null)
  }, [pendingSnip, book, addSnip])

  const handleSnipCancel = useCallback(() => {
    setPendingSnip(null)
  }, [])

  const search = useSearch(book?.full_path)

  const currentPageRef = useRef(currentPage)
  const totalPagesRef = useRef(totalPages)
  // Keep totalPagesRef in sync
  useEffect(() => {
    totalPagesRef.current = totalPages
  }, [totalPages])

  // Save totalPages to progress when docInfo loads
  useEffect(() => {
    if (slug && totalPages > 0 && dirPathRef.current) {
      update(dirPathRef.current, slug, { totalPages })
    }
  }, [slug, totalPages, update])

  // Scroll to match page when navigating matches
  useEffect(() => {
    if (search.currentMatchPage > 0) {
      setSavedProgressPage((prev) => prev ?? currentPageRef.current)
      scrollSeq.current += 1
      setScrollRequest({ page: search.currentMatchPage, seq: scrollSeq.current })
    }
  }, [search.currentMatchPage, search.currentIndex])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip when focus is in a text field (search bar, command palette, etc.)
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 'f') {
        e.preventDefault()
        setSearchOpen((o) => !o)
      } else if (mod && e.key === 'b') {
        e.preventDefault()
        setOutlineOpen((o) => !o)
      } else if (mod && e.key === 'w') {
        e.preventDefault()
        if (slug) closeTabAndNavigate(slug)
      } else if (mod && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault()
        const reopened = reopenTab()
        if (reopened) navigate(reopened.route)
      } else if (e.shiftKey && e.altKey && (e.key === 'H' || e.key === 'h')) {
        e.preventDefault()
        const currentTabs = tabsRef.current
        const idx = currentTabs.findIndex((t) => t.slug === slug)
        if (idx > 0) selectTab(currentTabs[idx - 1].slug)
      } else if (e.shiftKey && e.altKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault()
        const currentTabs = tabsRef.current
        const idx = currentTabs.findIndex((t) => t.slug === slug)
        if (idx >= 0 && idx < currentTabs.length - 1) selectTab(currentTabs[idx + 1].slug)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [slug, closeTabAndNavigate, selectTab, reopenTab, navigate])

  // Listen for command palette custom events
  useEffect(() => {
    const handlers: Record<string, () => void> = {
      'axiomatic:toggle-outline': () => setOutlineOpen((o) => !o),
      'axiomatic:toggle-notes': () => setNotesOpen((o) => !o),
      'axiomatic:toggle-bookmarks': () => setBookmarksOpen((o) => !o),
      'axiomatic:toggle-highlights': () => setHighlightsOpen((o) => !o),
      'axiomatic:toggle-zen': () => setZenMode((z) => !z),
      'axiomatic:toggle-snip': () => { if (snipModeRef.current) exitSnipMode(); else enterSnipMode() },
      'axiomatic:exit-snip': exitSnipMode,
    }
    const cleanups = Object.entries(handlers).map(([event, handler]) => {
      window.addEventListener(event, handler)
      return () => window.removeEventListener(event, handler)
    })
    return () => cleanups.forEach((fn) => fn())
  }, [exitSnipMode, enterSnipMode])

  // ESC exits zen mode
  useEffect(() => {
    if (!zenMode) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setZenMode(false)
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [zenMode])

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
      if (slug && hasLoadedRef.current && dirPathRef.current) {
        update(dirPathRef.current, slug, {
          currentPage: savedProgressPageRef.current ?? currentPageRef.current,
          totalPages: totalPagesRef.current,
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  const handleOutlineResizeMouseDown = useCallback((e: ReactMouseEvent) => {
    e.preventDefault()
    const onMouseMove = (ev: globalThis.MouseEvent) => {
      const newWidth = Math.min(500, Math.max(120, ev.clientX))
      setOutlinePaneWidth(newWidth)
    }
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

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

  const handleHighlightsResizeMouseDown = useCallback((e: ReactMouseEvent) => {
    e.preventDefault()
    const onMouseMove = (ev: globalThis.MouseEvent) => {
      const newWidth = Math.min(500, Math.max(180, window.innerWidth - ev.clientX))
      setHighlightsPaneWidth(newWidth)
    }
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  const handleBookmarksResizeMouseDown = useCallback((e: ReactMouseEvent) => {
    e.preventDefault()
    const onMouseMove = (ev: globalThis.MouseEvent) => {
      const newWidth = Math.min(500, Math.max(180, window.innerWidth - ev.clientX))
      setBookmarksPaneWidth(newWidth)
    }
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  const handlePaneNavigate = useCallback(
    (page: number) => {
      setSavedProgressPage((prev) => prev ?? currentPageRef.current)
      scrollSeq.current += 1
      setScrollRequest({ page, seq: scrollSeq.current })
    },
    [],
  )

  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page)
      if (savedProgressPage != null) return
      currentPageRef.current = page
      if (slug && dirPathRef.current) {
        update(dirPathRef.current, slug, {
          currentPage: page,
          totalPages: totalPagesRef.current,
        })
      }
    },
    [slug, update, savedProgressPage],
  )

  const handleOutlineNavigate = useCallback(
    (page: number) => {
      scrollSeq.current += 1
      setScrollRequest({ page, seq: scrollSeq.current })
    },
    [],
  )

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

  if (docLoading || !docInfo) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#fdf6e3] dark:bg-[#002b36]">
        <p className="text-[#657b83] dark:text-[#93a1a1]">Opening document...</p>
      </div>
    )
  }

  if (docError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[#657b83] dark:bg-[#002b36] dark:text-[#93a1a1]">
        <p>Failed to open document.</p>
        <p className="text-xs text-[#dc322f]">{docError}</p>
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
      <div style={zenMode ? { display: 'none' } : undefined}>
        <ReaderToolbar
          title={book.title}
          currentPage={currentPage}
          totalPages={totalPages}
          zoom={zoom}
          onZoomChange={handleZoomChange}
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
          zenMode={zenMode}
          activeSlug={slug}
          activeDirPath={book.dir_path}
        />
      </div>
      {!zenMode && (
        <TabBar
          tabs={tabs}
          activeSlug={slug ?? null}
          onSelect={selectTab}
          onClose={closeTabAndNavigate}
          onCloseOthers={closeOtherTabsAndNavigate}
        />
      )}
      <div className="flex min-h-0 flex-1">
        {!zenMode && outlineOpen && (
          <>
            <div
              className="shrink-0 overflow-hidden bg-[#fdf6e3] dark:bg-[#002b36]"
              style={{ width: outlinePaneWidth }}
            >
              <OutlineSidebar
                docInfo={docInfo}
                fullPath={book.full_path}
                currentPage={currentPage}
                onNavigate={handleOutlineNavigate}
              />
            </div>
            <div
              className="w-1.5 shrink-0 cursor-col-resize bg-[#eee8d5] hover:bg-[#268bd2] active:bg-[#268bd2] dark:bg-[#073642] dark:hover:bg-[#268bd2] dark:active:bg-[#268bd2]"
              onMouseDown={handleOutlineResizeMouseDown}
            />
          </>
        )}
        <div
          className={`relative flex min-w-0 flex-1 flex-col ${activePane === 'pdf' ? 'border-t-2 border-[#268bd2]' : 'border-t-2 border-[#eee8d5] dark:border-[#073642]'}`}
          style={snipMode ? { boxShadow: 'inset 0 0 24px rgba(38, 139, 210, 0.15)' } : undefined}
        >
          {pendingSnip && (
            <SnipBanner
              onSave={handleSnipSave}
              onCancel={handleSnipCancel}
            />
          )}
          <PdfViewer
            key={book.full_path}
            ref={pdfViewerRef}
            docInfo={docInfo}
            fullPath={book.full_path}
            initialPage={stableInitialPage}
            onPageChange={handlePageChange}
            containerRef={pdfContainerRef}
            scrollRequest={scrollRequest}
            highlightsForPage={highlightsForPage}
            onDeleteHighlight={deleteHighlight}
            onDeleteHighlightGroup={deleteHighlightGroup}
            onCreateHighlight={createHighlight}
            snipMode={snipMode && !pendingSnip}
            onSnipRegion={handleSnipRegion}
          />
          {snipToast && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 z-40 flex justify-center">
              <div className="rounded-lg bg-[#073642] px-4 py-2 text-sm text-[#93a1a1] shadow-lg dark:bg-[#eee8d5] dark:text-[#586e75]">
                {snipToast}
              </div>
            </div>
          )}
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
        {!zenMode && bookmarksOpen && slug && (
          <>
            <div
              className="w-1.5 shrink-0 cursor-col-resize bg-[#eee8d5] hover:bg-[#268bd2] active:bg-[#268bd2] dark:bg-[#073642] dark:hover:bg-[#268bd2] dark:active:bg-[#268bd2]"
              onMouseDown={handleBookmarksResizeMouseDown}
            />
            <div className="flex h-full min-h-0 flex-col border-t-2 border-[#eee8d5] dark:border-[#073642]">
              <BookmarksPanel
                bookmarks={bookmarkHighlights}
                width={bookmarksPaneWidth}
                onNavigate={handlePaneNavigate}
                onDeleteHighlight={deleteHighlight}
                onDeleteHighlightGroup={deleteHighlightGroup}
              />
            </div>
          </>
        )}
        {!zenMode && highlightsOpen && slug && (
          <>
            <div
              className="w-1.5 shrink-0 cursor-col-resize bg-[#eee8d5] hover:bg-[#268bd2] active:bg-[#268bd2] dark:bg-[#073642] dark:hover:bg-[#268bd2] dark:active:bg-[#268bd2]"
              onMouseDown={handleHighlightsResizeMouseDown}
            />
            <div className="flex h-full min-h-0 flex-col border-t-2 border-[#eee8d5] dark:border-[#073642]">
              <HighlightsPanel
                highlights={colorHighlights}
                width={highlightsPaneWidth}
                onNavigate={handlePaneNavigate}
                onDeleteHighlight={deleteHighlight}
                onDeleteHighlightGroup={deleteHighlightGroup}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
