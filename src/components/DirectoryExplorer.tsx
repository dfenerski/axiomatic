import { useState } from 'react'
import type { Directory } from '../hooks/useDirectories'
import type { Textbook } from '../hooks/useTextbooks'

interface Props {
  directories: Directory[]
  textbooks: Textbook[]
  onAdd: () => void
  onRemove: (id: number) => void
  onClose: () => void
}

export function DirectoryExplorer({
  directories,
  textbooks,
  onAdd,
  onRemove,
  onClose,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})

  const toggle = (id: number) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))

  return (
    <div className="fixed inset-y-0 left-0 z-30 flex w-80 flex-col border-r border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Library Sources
        </h2>
        <button
          onClick={onClose}
          className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          aria-label="Close explorer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="px-4 py-2">
        <button
          onClick={onAdd}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 transition hover:border-gray-400 hover:text-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-300"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Directory
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {directories.length === 0 && (
          <p className="px-2 pt-4 text-center text-xs text-gray-400 dark:text-gray-500">
            No directories attached yet.
          </p>
        )}
        {directories.map((dir) => {
          const dirBooks = textbooks.filter((b) => b.dir_id === dir.id)
          const isCollapsed = !!collapsed[dir.id]
          return (
            <div key={dir.id} className="mt-1">
              <div className="flex items-center gap-1 rounded px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <button
                  onClick={() => toggle(dir.id)}
                  className="shrink-0 text-gray-400 dark:text-gray-500"
                  aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-yellow-500 dark:text-yellow-400">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700 dark:text-gray-300">
                  {dir.label}
                </span>
                <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                  {dirBooks.length}
                </span>
                <button
                  onClick={() => onRemove(dir.id)}
                  className="shrink-0 rounded p-0.5 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                  aria-label={`Remove ${dir.label}`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
              {!isCollapsed && (
                <div className="ml-5 border-l border-gray-200 pl-2 dark:border-gray-700">
                  {dirBooks.length === 0 ? (
                    <p className="py-1 text-[10px] text-gray-400 dark:text-gray-500">
                      No PDFs found
                    </p>
                  ) : (
                    dirBooks.map((book) => (
                      <div
                        key={book.slug}
                        className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/50"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-red-400 dark:text-red-500">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="truncate">{book.title}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
