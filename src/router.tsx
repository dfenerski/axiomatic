import { createBrowserRouter, Outlet } from 'react-router-dom'
import { OverviewPage } from './pages/OverviewPage'
import { ReaderPage } from './pages/ReaderPage'
import { Titlebar } from './components/Titlebar'

function Layout() {
  return (
    <div className="flex h-screen flex-col">
      <Titlebar />
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
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
