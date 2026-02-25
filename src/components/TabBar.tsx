import { useState, useRef, useCallback, useEffect } from 'react'
import type { OpenTab } from '../hooks/useTabs'

interface Props {
  tabs: OpenTab[]
  activeSlug: string | null
  onSelect: (slug: string) => void
  onClose: (slug: string) => void
  onCloseOthers: (slug: string) => void
}

interface ContextMenu {
  x: number
  y: number
  slug: string
}

export function TabBar({ tabs, activeSlug, onSelect, onClose, onCloseOthers }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<ContextMenu | null>(null)

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!scrollRef.current) return
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault()
      scrollRef.current.scrollLeft += e.deltaY
    }
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent, slug: string) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, slug })
  }, [])

  // Close menu on click outside or Escape
  useEffect(() => {
    if (!menu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menu])

  if (tabs.length <= 1) return null

  return (
    <>
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="flex shrink-0 overflow-hidden bg-[#fdf6e3] dark:bg-[#002b36]"
      >
        {tabs.map((tab) => {
          const isActive = tab.slug === activeSlug
          return (
            <div
              key={tab.slug}
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(tab.slug)}
              onContextMenu={(e) => handleContextMenu(e, tab.slug)}
              className={`group relative flex min-w-[100px] max-w-[180px] shrink-0 cursor-pointer items-center border-r border-[#eee8d5] dark:border-[#073642] ${
                isActive
                  ? 'bg-[#eee8d5]/50 dark:bg-[#073642]/50'
                  : 'hover:bg-[#eee8d5]/30 dark:hover:bg-[#073642]/30'
              }`}
            >
              {isActive && (
                <span className="absolute inset-x-0 top-0 h-[2px] bg-[#268bd2]" />
              )}
              <span
                className={`min-w-0 flex-1 truncate py-1.5 pl-3 pr-1 text-xs ${
                  isActive
                    ? 'text-[#073642] dark:text-[#eee8d5]'
                    : 'text-[#93a1a1] dark:text-[#657b83]'
                }`}
              >
                {tab.title}
              </span>
              <span
                role="button"
                tabIndex={0}
                aria-label={`Close ${tab.title}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.slug)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation()
                    onClose(tab.slug)
                  }
                }}
                className={`mr-1.5 shrink-0 rounded p-1 ${
                  isActive
                    ? 'text-[#93a1a1] hover:bg-[#93a1a1]/20 hover:text-[#586e75] dark:text-[#657b83] dark:hover:text-[#93a1a1]'
                    : 'text-transparent hover:bg-[#93a1a1]/20 hover:text-[#93a1a1] group-hover:text-[#93a1a1]/40 dark:hover:text-[#657b83] dark:group-hover:text-[#657b83]/40'
                }`}
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </span>
            </div>
          )
        })}
      </div>

      {menu && (
        <div
          ref={menuRef}
          style={{ left: menu.x, top: menu.y }}
          className="fixed z-50 min-w-[160px] rounded border border-[#eee8d5] bg-[#fdf6e3] py-1 shadow-lg dark:border-[#073642] dark:bg-[#002b36]"
        >
          <button
            className="w-full px-3 py-1.5 text-left text-xs text-[#586e75] hover:bg-[#eee8d5] dark:text-[#839496] dark:hover:bg-[#073642]"
            onClick={() => {
              onClose(menu.slug)
              setMenu(null)
            }}
          >
            Close
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-xs text-[#586e75] hover:bg-[#eee8d5] dark:text-[#839496] dark:hover:bg-[#073642]"
            onClick={() => {
              onCloseOthers(menu.slug)
              setMenu(null)
            }}
          >
            Close Others
          </button>
        </div>
      )}
    </>
  )
}
