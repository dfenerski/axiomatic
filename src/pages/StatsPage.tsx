import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDirectories } from '../hooks/useDirectories'
import { togglePalette } from '../lib/palette'
import { StudyStats } from '../components/StudyStats'

export function StatsPage() {
  const { directories } = useDirectories()
  const dirPaths = useMemo(() => directories.map((d) => d.path), [directories])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#fdf6e3] dark:bg-[#002b36]">
      <div className="flex h-10 shrink-0 items-center border-b border-[#eee8d5] bg-[#fdf6e3] px-3 dark:border-[#073642] dark:bg-[#002b36]">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Link
            to="/"
            className="shrink-0 rounded p-1.5 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
            aria-label="Back to library"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </Link>
          <span className="text-sm font-medium text-[#586e75] dark:text-[#93a1a1]">Stats</span>
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
      <div className="min-h-0 flex-1 overflow-y-auto">
        <StudyStats dirPaths={dirPaths} />
      </div>
    </div>
  )
}
