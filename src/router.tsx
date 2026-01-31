import { createBrowserRouter } from 'react-router-dom'
import { OverviewPage } from './pages/OverviewPage'
import { ReaderPage } from './pages/ReaderPage'

export const router = createBrowserRouter([
  { path: '/', element: <OverviewPage /> },
  { path: '/read/:slug', element: <ReaderPage /> },
])
