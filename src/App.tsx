import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { migrateNotesToSqlite } from './lib/migrate'

export default function App() {
  useEffect(() => {
    migrateNotesToSqlite()
  }, [])

  return <RouterProvider router={router} />
}
