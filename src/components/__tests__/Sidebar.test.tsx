import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from '../Sidebar'

function renderSidebar(props: { collapsed?: boolean; zenMode?: boolean; onToggleCollapse?: () => void }, initialRoute = '/') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Sidebar collapsed={props.collapsed ?? false} zenMode={props.zenMode ?? false} onToggleCollapse={props.onToggleCollapse} />
    </MemoryRouter>,
  )
}

describe('Sidebar', () => {
  // nav items present with correct labels
  it('renders Projects, Snips, and Stats nav items', () => {
    renderSidebar({})
    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(screen.getByText('Snips')).toBeInTheDocument()
    expect(screen.getByText('Stats')).toBeInTheDocument()
  })

  // active item highlighted
  it('highlights the active nav item', () => {
    renderSidebar({}, '/snips')
    const snipsLink = screen.getByText('Snips').closest('a')
    expect(snipsLink?.className).toContain('268bd2') // solarized blue
  })

  // expanded on non-reader pages
  it('shows labels when expanded', () => {
    renderSidebar({ collapsed: false })
    expect(screen.getByText('Projects')).toBeVisible()
    expect(screen.getByText('Snips')).toBeVisible()
    expect(screen.getByText('Stats')).toBeVisible()
  })

  // collapsed — labels hidden, NO hover expand
  it('hides labels when collapsed', () => {
    renderSidebar({ collapsed: true })
    expect(screen.queryByText('Projects')).toBeNull()
    expect(screen.queryByText('Snips')).toBeNull()
    expect(screen.queryByText('Stats')).toBeNull()
  })

  it('does NOT expand on hover when collapsed', () => {
    renderSidebar({ collapsed: true })
    const nav = screen.getByRole('navigation')
    fireEvent.mouseEnter(nav)
    // Labels should remain hidden — no hover expand
    expect(screen.queryByText('Projects')).toBeNull()
    expect(screen.queryByText('Snips')).toBeNull()
  })

  // hidden in zen mode
  it('renders nothing in zen mode', () => {
    const { container } = renderSidebar({ zenMode: true })
    expect(container.querySelector('nav')).toBeNull()
  })

  // collapse toggle button
  it('renders collapse toggle button when onToggleCollapse is provided', () => {
    const toggle = vi.fn()
    renderSidebar({ collapsed: false, onToggleCollapse: toggle })
    const btn = screen.getByText('Collapse')
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(toggle).toHaveBeenCalledOnce()
  })

  it('does not render toggle button when onToggleCollapse is not provided', () => {
    renderSidebar({ collapsed: false })
    expect(screen.queryByText('Collapse')).toBeNull()
    expect(screen.queryByText('Expand')).toBeNull()
  })

  // when collapsed, toggle button shows icon only (no "Expand" text since no hover)
  it('shows only icon for toggle when collapsed', () => {
    const toggle = vi.fn()
    renderSidebar({ collapsed: true, onToggleCollapse: toggle })
    // The button should exist (has the SVG) but no "Expand" text label
    expect(screen.queryByText('Expand')).toBeNull()
    expect(screen.queryByText('Collapse')).toBeNull()
    // The button is still clickable via its SVG parent
    const nav = screen.getByRole('navigation')
    const buttons = nav.querySelectorAll('button')
    expect(buttons.length).toBe(1)
    fireEvent.click(buttons[0])
    expect(toggle).toHaveBeenCalledOnce()
  })
})
