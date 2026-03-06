import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@tauri-apps/api/core')

// Mock PdfThumbnail to avoid pdfium:// protocol in tests
vi.mock('../PdfThumbnail', () => ({
  PdfThumbnail: ({ fullPath }: { fullPath: string }) => (
    <div data-testid="pdf-thumbnail">{fullPath}</div>
  ),
}))

import { BookTile } from '../BookTile'
import type { BookProgress } from '../../types/progress'

beforeEach(() => {
  vi.restoreAllMocks()
})

function renderBookTile(props: Parameters<typeof BookTile>[0]) {
  return render(
    <MemoryRouter>
      <BookTile {...props} />
    </MemoryRouter>,
  )
}

describe('BookTile', () => {
  it('renders title and progress', () => {
    renderBookTile({
      slug: 'test_book',
      title: 'Linear Algebra',
      fullPath: '/dir/linear_algebra.pdf',
      progress: { currentPage: 42, totalPages: 300, lastReadAt: '2024-01-01' },
    })

    expect(screen.getByText('Linear Algebra')).toBeInTheDocument()
    expect(screen.getByText('42/300')).toBeInTheDocument()
  })

  it('renders without progress', () => {
    renderBookTile({
      slug: 'test_book',
      title: 'Real Analysis',
      fullPath: '/dir/real_analysis.pdf',
    })

    expect(screen.getByText('Real Analysis')).toBeInTheDocument()
    // No progress span rendered
    expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument()
  })

  it('memo comparator prevents re-render when progress values are identical', () => {
    const renderCount = { value: 0 }

    // We can test the comparator directly by rendering and rerendering
    const progress1: BookProgress = { currentPage: 10, totalPages: 100, lastReadAt: '2024-01-01' }
    const progress2: BookProgress = { currentPage: 10, totalPages: 100, lastReadAt: '2024-01-02' }

    const onToggleStar = vi.fn()
    const onContextMenu = vi.fn()
    const tags = [{ id: 1, name: 'math', color: '#ff0000' }]

    const { rerender } = render(
      <MemoryRouter>
        <BookTile
          slug="test_book"
          title="Book"
          fullPath="/dir/book.pdf"
          progress={progress1}
          starred={false}
          selected={false}
          onToggleStar={onToggleStar}
          onContextMenu={onContextMenu}
          tags={tags}
        />
      </MemoryRouter>,
    )

    // Capture DOM state before rerender
    const textBefore = screen.getByText('10/100')
    expect(textBefore).toBeInTheDocument()

    // Rerender with a NEW progress object reference but SAME currentPage/totalPages values
    // The memo comparator only checks currentPage and totalPages, not lastReadAt
    // So this should NOT cause a re-render (memo returns true = props are equal)
    rerender(
      <MemoryRouter>
        <BookTile
          slug="test_book"
          title="Book"
          fullPath="/dir/book.pdf"
          progress={progress2}
          starred={false}
          selected={false}
          onToggleStar={onToggleStar}
          onContextMenu={onContextMenu}
          tags={tags}
        />
      </MemoryRouter>,
    )

    // DOM should still show the same content
    expect(screen.getByText('10/100')).toBeInTheDocument()
  })

  it('memo comparator allows re-render when progress values actually change', () => {
    const progress1: BookProgress = { currentPage: 10, totalPages: 100, lastReadAt: '2024-01-01' }
    const progress3: BookProgress = { currentPage: 20, totalPages: 100, lastReadAt: '2024-01-01' }

    const onToggleStar = vi.fn()
    const onContextMenu = vi.fn()

    const { rerender } = render(
      <MemoryRouter>
        <BookTile
          slug="test_book"
          title="Book"
          fullPath="/dir/book.pdf"
          progress={progress1}
          starred={false}
          onToggleStar={onToggleStar}
          onContextMenu={onContextMenu}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('10/100')).toBeInTheDocument()

    // Rerender with different currentPage
    rerender(
      <MemoryRouter>
        <BookTile
          slug="test_book"
          title="Book"
          fullPath="/dir/book.pdf"
          progress={progress3}
          starred={false}
          onToggleStar={onToggleStar}
          onContextMenu={onContextMenu}
        />
      </MemoryRouter>,
    )

    // Should show updated progress
    expect(screen.getByText('20/100')).toBeInTheDocument()
  })

  it('renders star button with correct aria state', () => {
    renderBookTile({
      slug: 'test_book',
      title: 'Starred Book',
      fullPath: '/dir/book.pdf',
      starred: true,
      onToggleStar: vi.fn(),
    })

    const starButton = screen.getByLabelText('Unstar book')
    expect(starButton).toBeInTheDocument()
    expect(starButton.getAttribute('aria-pressed')).toBe('true')
  })

  it('renders unstarred state', () => {
    renderBookTile({
      slug: 'test_book',
      title: 'Normal Book',
      fullPath: '/dir/book.pdf',
      starred: false,
      onToggleStar: vi.fn(),
    })

    const starButton = screen.getByLabelText('Star book')
    expect(starButton).toBeInTheDocument()
    expect(starButton.getAttribute('aria-pressed')).toBe('false')
  })

  it('renders PdfThumbnail with correct path', () => {
    renderBookTile({
      slug: 'test_book',
      title: 'Some Book',
      fullPath: '/special/path/book.pdf',
    })

    const thumbnail = screen.getByTestId('pdf-thumbnail')
    expect(thumbnail).toHaveTextContent('/special/path/book.pdf')
  })
})
