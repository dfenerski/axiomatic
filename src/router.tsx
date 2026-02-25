import { createBrowserRouter, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { OverviewPage } from './pages/OverviewPage'
import { ReaderPage } from './pages/ReaderPage'
import { LoopPage } from './pages/LoopPage'
import { Titlebar } from './components/Titlebar'
import { CommandPalette, type Command } from './components/CommandPalette'
import { useTheme, setTheme } from './hooks/useTheme'
import { registerPaletteToggle } from './lib/palette'
import { subscribeReaderState, getReaderStateSnapshot } from './lib/readerState'

function Layout() {
  const [isLinux, setIsLinux] = useState<boolean | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const isReader = location.pathname.startsWith('/read/')

  useEffect(() => {
    invoke<string>('get_platform').then((p) => setIsLinux(p === 'linux'))
  }, [])

  // Register the module-level toggle; Ctrl+P shortcut
  useEffect(() => {
    const unregister = registerPaletteToggle(() => setPaletteOpen((o) => !o))
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      unregister()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const readerState = useSyncExternalStore(subscribeReaderState, getReaderStateSnapshot)

  const closePalette = useCallback(() => setPaletteOpen(false), [])

  const snipping = isReader && readerState.snipMode
  const hasSnips = isReader && readerState.hasSnips
  const readerSlug = isReader ? location.pathname.replace('/read/', '') : null

  const commands = useMemo(() => {
    const cmds: Command[] = [
      {
        id: 'theme-system',
        label: 'Use OS theme',
        action: () => setTheme('system'),
      },
      {
        id: 'theme-toggle',
        label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        action: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
    ]

    if (isReader) {
      cmds.push(
        {
          id: 'toggle-outline',
          label: 'Toggle outline',
          shortcut: 'Ctrl+B',
          action: () => window.dispatchEvent(new CustomEvent('axiomatic:toggle-outline')),
        },
        {
          id: 'toggle-notes',
          label: 'Toggle notes',
          shortcut: 'Ctrl+L',
          action: () => window.dispatchEvent(new CustomEvent('axiomatic:toggle-notes')),
        },
        {
          id: 'toggle-bookmarks',
          label: 'Toggle bookmarks',
          action: () => window.dispatchEvent(new CustomEvent('axiomatic:toggle-bookmarks')),
        },
        {
          id: 'toggle-highlights',
          label: 'Toggle highlights',
          action: () => window.dispatchEvent(new CustomEvent('axiomatic:toggle-highlights')),
        },
        {
          id: 'toggle-zen',
          label: 'Toggle zen mode',
          action: () => window.dispatchEvent(new CustomEvent('axiomatic:toggle-zen')),
        },
      )

      if (snipping) {
        cmds.push({
          id: 'stop-snipping',
          label: 'Stop snipping',
          action: () => window.dispatchEvent(new CustomEvent('axiomatic:exit-snip')),
        })
      } else {
        cmds.push({
          id: 'snip',
          label: 'Snip',
          action: () => window.dispatchEvent(new CustomEvent('axiomatic:toggle-snip')),
        })
      }

      if (hasSnips && readerSlug) {
        cmds.push(
          {
            id: 'loop-sorted',
            label: 'Loop (sorted)',
            action: () => navigate(`/loop/${readerSlug}?mode=sorted`),
          },
          {
            id: 'loop-shuffled',
            label: 'Loop (shuffled)',
            action: () => navigate(`/loop/${readerSlug}?mode=shuffled`),
          },
        )
      }
    }

    return cmds
  }, [isReader, theme, snipping, hasSnips, readerSlug, navigate])

  // Avoid flash — render nothing until platform is known
  if (isLinux === null) return null

  const palette = paletteOpen && (
    <CommandPalette commands={commands} onClose={closePalette} />
  )

  if (isLinux) {
    return (
      <div className="flex h-screen flex-col bg-[#fdf6e3] dark:bg-[#002b36]">
        {palette}
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col p-2">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-[#fdf6e3] shadow-[0_1px_12px_rgba(0,0,0,0.2)] dark:bg-[#002b36] dark:shadow-[0_1px_12px_rgba(0,0,0,0.55)]">
        <Titlebar />
        {palette}
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <OverviewPage /> },
      { path: '/read/:slug', element: <ReaderPage /> },
      { path: '/loop/:slug', element: <LoopPage /> },
    ],
  },
])
