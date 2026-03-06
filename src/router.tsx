import { createBrowserRouter, Outlet, useLocation } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { OverviewPage } from './pages/OverviewPage'
import { ReaderPage } from './pages/ReaderPage'
import { LoopPage } from './pages/LoopPage'
import { SnipsPage } from './pages/SnipsPage'
import { StatsPage } from './pages/StatsPage'
import { Titlebar } from './components/Titlebar'
import { Sidebar } from './components/Sidebar'
import { CommandPalette } from './components/CommandPalette'
import { useTheme } from './hooks/useTheme'
import { registerPaletteToggle } from './lib/palette'
import { subscribeReaderState, getReaderStateSnapshot } from './lib/readerState'
import { buildCommands } from './lib/commands'

function Layout() {
  const [isLinux, setIsLinux] = useState<boolean | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const location = useLocation()
  const { theme } = useTheme()
  const isReader = location.pathname.startsWith('/read/')
  const isLoop = location.pathname.startsWith('/loop/')

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

  const commands = useMemo(() => buildCommands(isReader, theme), [isReader, theme])

  const [sidebarManualCollapsed, setSidebarManualCollapsed] = useState(true)
  const sidebarCollapsed = isReader || isLoop || sidebarManualCollapsed
  const sidebarZenMode = isReader && readerState.zenMode
  const toggleSidebarCollapse = useCallback(() => setSidebarManualCollapsed((c) => !c), [])

  // Avoid flash — render nothing until platform is known
  if (isLinux === null) return null

  const palette = paletteOpen && (
    <CommandPalette commands={commands} onClose={closePalette} />
  )

  if (isLinux) {
    return (
      <div className="flex h-screen flex-col bg-[#fdf6e3] dark:bg-[#002b36]">
        {palette}
        <div className="flex min-h-0 flex-1">
          <Sidebar collapsed={sidebarCollapsed} zenMode={sidebarZenMode} onToggleCollapse={toggleSidebarCollapse} />
          <div className="flex min-h-0 flex-1 flex-col">
            <Outlet />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col p-2">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-[#fdf6e3] shadow-[0_1px_12px_rgba(0,0,0,0.2)] dark:bg-[#002b36] dark:shadow-[0_1px_12px_rgba(0,0,0,0.55)]">
        <Titlebar />
        {palette}
        <div className="flex min-h-0 flex-1">
          <Sidebar collapsed={sidebarCollapsed} zenMode={sidebarZenMode} onToggleCollapse={toggleSidebarCollapse} />
          <div className="flex min-h-0 flex-1 flex-col">
            <Outlet />
          </div>
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
      { path: '/snips', element: <SnipsPage /> },
      { path: '/stats', element: <StatsPage /> },
    ],
  },
])
