import { useCallback, useEffect, useMemo } from 'react'

import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useTextbooks } from '../hooks/useTextbooks'
import { useSnips } from '../hooks/useSnips'
import { useTabNavigation } from '../hooks/useTabs'
import { LoopCarousel } from '../components/LoopCarousel'
import { TabBar } from '../components/TabBar'
import { PomodoroTimer } from '../components/PomodoroTimer'

export function LoopPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const shuffled = searchParams.get('mode') === 'shuffled'

  const { textbooks, loading } = useTextbooks()
  const book = textbooks.find((b) => b.slug === slug)
  const { snips, xp, incrementXp } = useSnips(slug, book?.dir_path)
  const pathMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const tb of textbooks) {
      map.set(tb.slug, tb.full_path)
      map.set(tb.dir_path + ':' + tb.file, tb.full_path)
    }
    return map
  }, [textbooks])
  const tabSlug = useMemo(() => `loop:${slug}`, [slug])
  const { tabs, openTab, closeTabAndNavigate, closeOtherTabsAndNavigate, selectTab } = useTabNavigation(tabSlug)

  // Register the loop tab
  useEffect(() => {
    if (book && slug) {
      openTab({
        slug: tabSlug,
        title: `Loop: ${book.title}`,
        fullPath: book.full_path,
        route: `/loop/${slug}?mode=${shuffled ? 'shuffled' : 'sorted'}`,
      })
    }
  }, [book, slug, openTab, tabSlug, shuffled])

  const handleExit = useCallback(() => {
    closeTabAndNavigate(tabSlug)
  }, [closeTabAndNavigate, tabSlug])

  // Ctrl+W to close the loop tab
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault()
        handleExit()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleExit])

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
          className="text-sm text-[#268bd2] underline"
        >
          Go back
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TabBar
        tabs={tabs}
        activeSlug={tabSlug}
        onSelect={selectTab}
        onClose={closeTabAndNavigate}
        onCloseOthers={closeOtherTabsAndNavigate}
      />
      <div className="flex shrink-0 items-center justify-end border-b border-[#eee8d5] bg-[#fdf6e3] px-3 dark:border-[#073642] dark:bg-[#002b36]">
        <PomodoroTimer zenMode={false} activeSlug={slug} activeDirPath={book?.dir_path} />
      </div>
      <LoopCarousel
        snips={snips}
        xp={xp}
        onIncrementXp={incrementXp}
        onExit={handleExit}
        shuffled={shuffled}
        pathMap={pathMap}
        dirPath={book?.dir_path}
      />
    </div>
  )
}
