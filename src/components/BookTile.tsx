import { memo } from 'react'
import { Link } from 'react-router-dom'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { BookProgress } from '../types/progress'
import type { Tag } from '../hooks/useTags'
import { PdfThumbnail } from './PdfThumbnail'

interface Props {
  slug: string
  title: string
  fullPath: string
  progress?: BookProgress
  starred?: boolean
  selected?: boolean
  tags?: Tag[]
  onToggleStar?: (slug: string) => void
  onTotalPages?: (slug: string, total: number) => void
  onContextMenu?: (slug: string, x: number, y: number) => void
}

export const BookTile = memo(function BookTile({
  slug,
  title,
  fullPath,
  progress,
  starred,
  selected,
  onToggleStar,
  onTotalPages,
  onContextMenu,
  tags,
}: Props) {
  const progressText = progress
    ? `${progress.currentPage}/${progress.totalPages}`
    : null

  const pdfUrl = convertFileSrc(fullPath)

  return (
    <Link
      to={`/read/${slug}`}
      className={`group flex flex-col gap-2 rounded-lg p-2 hover:bg-[#eee8d5] dark:hover:bg-[#073642] ${selected ? 'ring-2 ring-[#268bd2] bg-[#268bd2]/10 dark:bg-[#268bd2]/20' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu?.(slug, e.clientX, e.clientY)
      }}
    >
      <div className="relative">
        <PdfThumbnail
          file={pdfUrl}
          fullPath={fullPath}
          cacheKey={slug}
          onTotalPages={onTotalPages ? (total) => onTotalPages(slug, total) : undefined}
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
          className="absolute top-1.5 right-1.5 rounded-full bg-black/40 p-1 text-white opacity-0 hover:bg-black/60 group-hover:opacity-100 aria-[pressed=true]:opacity-100"
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
        {tags && tags.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 flex flex-wrap gap-1 p-1.5 opacity-0 group-hover:opacity-100">
            {tags.slice(0, 3).map((t) => (
              <span
                key={t.id}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                style={{ backgroundColor: t.color }}
              >
                {t.name}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
                +{tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
      <span className="truncate text-sm font-medium text-[#073642] dark:text-[#eee8d5] dark:group-hover:text-[#fdf6e3]">
        {title}
      </span>
    </Link>
  )
}, (prev, next) =>
  prev.slug === next.slug &&
  prev.title === next.title &&
  prev.fullPath === next.fullPath &&
  prev.starred === next.starred &&
  prev.selected === next.selected &&
  prev.tags === next.tags &&
  prev.onToggleStar === next.onToggleStar &&
  prev.onTotalPages === next.onTotalPages &&
  prev.onContextMenu === next.onContextMenu &&
  prev.progress?.currentPage === next.progress?.currentPage &&
  prev.progress?.totalPages === next.progress?.totalPages)
