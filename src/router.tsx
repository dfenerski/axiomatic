import { createBrowserRouter, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { OverviewPage } from './pages/OverviewPage'
import { ReaderPage } from './pages/ReaderPage'
import { Titlebar } from './components/Titlebar'

function Layout() {
  const [isLinux, setIsLinux] = useState<boolean | null>(null)

  useEffect(() => {
    invoke<string>('get_platform').then((p) => setIsLinux(p === 'linux'))
  }, [])

  // Avoid flash — render nothing until platform is known
  if (isLinux === null) return null

  if (isLinux) {
    return (
      <div className="flex h-screen flex-col bg-[#fdf6e3] dark:bg-[#002b36]">
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
    ],
  },
])
