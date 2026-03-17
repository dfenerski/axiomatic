import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/palette', () => ({ togglePalette: vi.fn() }))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../hooks/useTextbooks', () => ({
  useTextbooks: () => ({
    textbooks: [
      { slug: 'algebra', title: 'Linear Algebra', file: 'algebra.pdf', dir_id: 1, dir_path: '/lib', full_path: '/lib/algebra.pdf' },
      { slug: 'calculus', title: 'Calculus', file: 'calculus.pdf', dir_id: 2, dir_path: '/math', full_path: '/math/calculus.pdf' },
    ],
    loading: false,
    refresh: vi.fn(),
  }),
}))

vi.mock('../../hooks/useDirectories', () => ({
  useDirectories: () => ({
    directories: [
      { id: 1, path: '/lib', label: 'Library', added_at: '2024-01-01' },
      { id: 2, path: '/math', label: 'Math', added_at: '2024-01-02' },
    ],
    add: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock('../../hooks/useProgress', () => ({
  useProgress: () => ({ progress: {} }),
}))

vi.mock('../../hooks/useStarred', () => ({
  useStarred: () => ({
    starred: { algebra: true },
    toggle: vi.fn(),
  }),
}))

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({
    tags: [],
    bookTags: {},
    createTag: vi.fn(),
    deleteTag: vi.fn(),
    tagBook: vi.fn(),
    untagBook: vi.fn(),
    updateTagColor: vi.fn(),
  }),
}))

vi.mock('../../hooks/useVimOverview', () => ({
  useVimOverview: () => ({ selectedIndex: -1 }),
}))

vi.mock('../../hooks/useBatchedRender', () => ({
  useBatchedRender: (total: number) => total,
}))

vi.mock('../../hooks/useSyncStatus', () => ({
  useSyncStatus: () => ({ state: 'synced' as const, rendered: 0, total: 0 }),
}))

// Mock BookTile to render a simple div with the title as text
vi.mock('../../components/BookTile', () => ({
  BookTile: ({ title, slug }: { title: string; slug: string }) => (
    <div data-testid={`tile-${slug}`}>{title}</div>
  ),
}))

// Mock TileGrid to just render children
vi.mock('../../components/TileGrid', () => ({
  TileGrid: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tile-grid">{children}</div>
  ),
}))

// Mock SyncStatus to avoid complexity
vi.mock('../../components/SyncStatus', () => ({
  SyncStatus: () => null,
}))

vi.mock('../../components/DirectoryExplorer', () => ({
  DirectoryExplorer: () => <div data-testid="directory-explorer" />,
}))

vi.mock('../../components/TagManager', () => ({
  TagManager: () => <div data-testid="tag-manager" />,
}))

import { OverviewPage } from '../OverviewPage'

const STORAGE_KEY = 'axiomatic:section-collapse'

function resetCollapseState() {
  localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(
    new StorageEvent('storage', { key: STORAGE_KEY, newValue: null }),
  )
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <OverviewPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockNavigate.mockClear()
  resetCollapseState()
})

describe('OverviewPage toolbar nav icons', () => {
  it('renders Snips link in the toolbar', () => {
    renderPage()
    const snipsLink = screen.getByLabelText('Snips')
    expect(snipsLink).toBeInTheDocument()
    expect(snipsLink.tagName).toBe('A')
    expect(snipsLink).toHaveAttribute('href', '/snips')
  })

  it('does not render a Stats link in the toolbar', () => {
    renderPage()
    expect(screen.queryByLabelText('Stats')).toBeNull()
  })

  it('Snips nav icon is not the scissors icon', () => {
    renderPage()
    const snipsLink = screen.getByLabelText('Snips')
    expect(snipsLink.querySelector('circle')).toBeNull()
  })

  it('Snips icon appears between Projects and Tags buttons', () => {
    renderPage()
    const projectsBtn = screen.getByLabelText('Projects')
    const snipsLink = screen.getByLabelText('Snips')
    const tagsBtn = screen.getByLabelText('Manage tags')

    // All three should be in DOM order: Projects, Snips, Tags
    const all = document.querySelectorAll('[aria-label]')
    const order = Array.from(all)
    const pIdx = order.indexOf(projectsBtn)
    const sIdx = order.indexOf(snipsLink)
    const tIdx = order.indexOf(tagsBtn)
    expect(pIdx).toBeLessThan(sIdx)
    expect(sIdx).toBeLessThan(tIdx)
  })
})

describe('OverviewPage collapsible sections', () => {
  it('sections are collapsed by default', () => {
    renderPage()

    // Section headers should be visible
    expect(screen.getByText('Starred')).toBeInTheDocument()
    expect(screen.getByText('Math')).toBeInTheDocument()

    // But tiles should NOT be rendered (sections are collapsed)
    expect(screen.queryByTestId('tile-algebra')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tile-calculus')).not.toBeInTheDocument()
  })

  it('clicking section header toggles section open', () => {
    renderPage()

    // Click the Starred header button to expand
    fireEvent.click(screen.getByText('Starred').closest('button')!)

    // Starred tile should now be visible
    expect(screen.getByTestId('tile-algebra')).toBeInTheDocument()

    // Math section still collapsed
    expect(screen.queryByTestId('tile-calculus')).not.toBeInTheDocument()
  })

  it('clicking expanded section header collapses it', () => {
    renderPage()

    const starredBtn = screen.getByText('Starred').closest('button')!

    // Expand
    fireEvent.click(starredBtn)
    expect(screen.getByTestId('tile-algebra')).toBeInTheDocument()

    // Collapse
    fireEvent.click(starredBtn)
    expect(screen.queryByTestId('tile-algebra')).not.toBeInTheDocument()
  })

  it('collapsed state persists to localStorage', () => {
    renderPage()

    // Expand Starred
    fireEvent.click(screen.getByText('Starred').closest('button')!)

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(stored['starred']).toBe(true)
  })

  it('section header shows item count', () => {
    renderPage()

    // Starred has 1 book (algebra is starred)
    const starredBtn = screen.getByText('Starred').closest('button')!
    expect(starredBtn.textContent).toContain('1')

    // Math section has 1 book (calculus in dir 2)
    const mathBtn = screen.getByText('Math').closest('button')!
    expect(mathBtn.textContent).toContain('1')
  })

  it('section headers are sticky with opaque background', () => {
    renderPage()

    const headers = document.querySelectorAll('[data-section-key]')
    expect(headers.length).toBeGreaterThan(0)

    for (const header of headers) {
      const cls = header.className
      expect(cls).toContain('sticky')
      expect(cls).toContain('top-0')
      // Must have opaque bg so content doesn't bleed through when stuck
      expect(cls).toMatch(/bg-\[#[0-9a-f]+\]/)
    }
  })

  it('section headers are visually emphasized', () => {
    renderPage()

    const headers = document.querySelectorAll('[data-section-key]')
    expect(headers.length).toBeGreaterThan(0)

    for (const header of headers) {
      const cls = header.className
      // Larger text and bold weight for prominence
      expect(cls).toContain('text-base')
      expect(cls).toContain('font-semibold')
      // Bottom border separator
      expect(cls).toContain('border-b')
      // Adequate vertical padding
      expect(cls).toContain('py-2')
    }
  })
})

describe('OverviewPage keyboard shortcuts', () => {
  it('Ctrl+S navigates to snips page', () => {
    renderPage()
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    expect(mockNavigate).toHaveBeenCalledWith('/snips')
  })

  it('Ctrl+D opens directory explorer', () => {
    renderPage()
    expect(screen.queryByTestId('directory-explorer')).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true })
    expect(screen.getByTestId('directory-explorer')).toBeInTheDocument()
  })

  it('Ctrl+T opens tag manager', () => {
    renderPage()
    expect(screen.queryByTestId('tag-manager')).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 't', ctrlKey: true })
    expect(screen.getByTestId('tag-manager')).toBeInTheDocument()
  })

  it('Ctrl+F opens search filter', () => {
    renderPage()
    expect(screen.queryByPlaceholderText('Filter books…')).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    expect(screen.getByPlaceholderText('Filter books…')).toBeInTheDocument()
  })

  it('Escape closes directory explorer', () => {
    renderPage()
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true })
    expect(screen.getByTestId('directory-explorer')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('directory-explorer')).not.toBeInTheDocument()
  })

  it('Escape closes tag manager', () => {
    renderPage()
    fireEvent.keyDown(window, { key: 't', ctrlKey: true })
    expect(screen.getByTestId('tag-manager')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('tag-manager')).not.toBeInTheDocument()
  })

  it('Escape closes search filter', () => {
    renderPage()
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    expect(screen.getByPlaceholderText('Filter books…')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Filter books…')).not.toBeInTheDocument()
  })

  it('Escape closes directory explorer when focus is in an input', () => {
    renderPage()
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true })
    expect(screen.getByTestId('directory-explorer')).toBeInTheDocument()
    // Create and focus an input inside the explorer
    const explorer = screen.getByTestId('directory-explorer')
    const input = document.createElement('input')
    explorer.appendChild(input)
    input.focus()
    // Fire Escape on the input so e.target.tagName === 'INPUT'
    fireEvent.keyDown(input, { key: 'Escape', bubbles: true })
    expect(screen.queryByTestId('directory-explorer')).not.toBeInTheDocument()
  })

  it('Escape closes tag manager when focus is in an input', () => {
    renderPage()
    fireEvent.keyDown(window, { key: 't', ctrlKey: true })
    expect(screen.getByTestId('tag-manager')).toBeInTheDocument()
    const tm = screen.getByTestId('tag-manager')
    const input = document.createElement('input')
    tm.appendChild(input)
    input.focus()
    fireEvent.keyDown(input, { key: 'Escape', bubbles: true })
    expect(screen.queryByTestId('tag-manager')).not.toBeInTheDocument()
  })
})
