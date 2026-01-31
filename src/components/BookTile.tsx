import { Link } from 'react-router-dom'
import type { BookProgress } from '../types/progress'
import { PdfThumbnail } from './PdfThumbnail'

interface Props {
  slug: string
  title: string
  file: string
  progress?: BookProgress
  starred?: boolean
  selected?: boolean
  onToggleStar?: (slug: string) => void
  onTotalPages?: (total: number) => void
}

export function BookTile({
  slug,
  title,
  file,
  progress,
  starred,
  selected,
  onToggleStar,
  onTotalPages,
}: Props) {
  const progressText = progress
    ? `${progress.currentPage}/${progress.totalPages}`
    : null

  return (
    <Link
      to={`/read/${slug}`}
      className={`group flex flex-col gap-2 rounded-lg p-2 transition hover:bg-gray-100 ${selected ? 'ring-2 ring-blue-500 bg-blue-50' : ''}`}
    >
      <div className="relative">
        <PdfThumbnail
          file={`/textbooks/${file}`}
          onTotalPages={onTotalPages}
        />
        {progressText && (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
            {progressText}
          </span>
        )}
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onToggleStar?.(slug)
          }}
          className="absolute top-1.5 right-1.5 rounded-full bg-black/40 p-1 text-white opacity-0 transition hover:bg-black/60 group-hover:opacity-100 aria-[pressed=true]:opacity-100"
          aria-pressed={!!starred}
          aria-label={starred ? 'Unstar book' : 'Star book'}
        >
          <svg
            viewBox="0 0 20 20"
            className="h-4 w-4"
            fill={starred ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path d="M10 2l2.39 4.84L17.3 7.7l-3.65 3.56.86 5.03L10 13.77l-4.51 2.52.86-5.03L2.7 7.7l4.91-.86L10 2z" />
          </svg>
        </button>
      </div>
      <span className="truncate text-sm font-medium text-gray-800 group-hover:text-black">
        {title}
      </span>
    </Link>
  )
}
