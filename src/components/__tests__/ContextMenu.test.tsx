import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ContextMenu, type MenuItem } from '../ContextMenu'

vi.mock('@tauri-apps/api/core')

// Mock createPortal to render inline
vi.mock('react-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-dom')>()
  return { ...mod, createPortal: (node: React.ReactNode) => node }
})

const items: MenuItem[] = [
  { label: 'Close', action: vi.fn() },
  { label: 'Close Others', action: vi.fn() },
  { label: 'Rename', action: vi.fn() },
]

function renderMenu(overrides: Partial<Parameters<typeof ContextMenu>[0]> = {}) {
  const onClose = vi.fn()
  const result = render(
    <ContextMenu x={100} y={200} items={items} onClose={onClose} {...overrides} />,
  )
  return { onClose, ...result }
}

describe('ContextMenu', () => {
  it('renders all menu items', () => {
    renderMenu()
    expect(screen.getByText('Close')).toBeInTheDocument()
    expect(screen.getByText('Close Others')).toBeInTheDocument()
    expect(screen.getByText('Rename')).toBeInTheDocument()
  })

  it('clicking an item calls its action and onClose', () => {
    const action = vi.fn()
    const menuItems: MenuItem[] = [{ label: 'Delete', action }]
    const { onClose } = renderMenu({ items: menuItems })

    fireEvent.click(screen.getByText('Delete'))

    expect(action).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape key calls onClose', () => {
    const { onClose } = renderMenu()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicking outside the menu calls onClose', () => {
    const { onClose } = renderMenu()

    // mousedown on the document body (outside the menu)
    fireEvent.mouseDown(document.body)

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
