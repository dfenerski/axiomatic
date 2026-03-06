import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from '../Sidebar'

function renderSidebar(props: { collapsed?: boolean; zenMode?: boolean }, initialRoute = '/') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Sidebar collapsed={props.collapsed ?? false} zenMode={props.zenMode ?? false} />
    </MemoryRouter>,
  )
}

describe('Sidebar', () => {
  // ac-156: nav items present
  it('renders Library, Snips, and Stats nav items', () => {
    renderSidebar({})
    expect(screen.getByText('Library')).toBeInTheDocument()
    expect(screen.getByText('Snips')).toBeInTheDocument()
    expect(screen.getByText('Stats')).toBeInTheDocument()
  })

  // ac-156: active item highlighted
  it('highlights the active nav item', () => {
    renderSidebar({}, '/snips')
    const snipsLink = screen.getByText('Snips').closest('a')
    expect(snipsLink?.className).toContain('268bd2') // solarized blue
  })

  // ac-156: expanded on non-reader pages
  it('shows labels when expanded', () => {
    renderSidebar({ collapsed: false })
    expect(screen.getByText('Library')).toBeVisible()
    expect(screen.getByText('Snips')).toBeVisible()
    expect(screen.getByText('Stats')).toBeVisible()
  })

  // ac-156: collapsed on reader pages — labels hidden until hover
  it('hides labels when collapsed', () => {
    renderSidebar({ collapsed: true })
    expect(screen.queryByText('Library')).toBeNull()
    expect(screen.queryByText('Snips')).toBeNull()
    expect(screen.queryByText('Stats')).toBeNull()
  })

  // ac-156: hidden in zen mode
  it('renders nothing in zen mode', () => {
    const { container } = renderSidebar({ zenMode: true })
    expect(container.querySelector('nav')).toBeNull()
  })

  // ac-157: hover-to-expand when collapsed
  it('expands on hover when collapsed', () => {
    renderSidebar({ collapsed: true })
    const nav = screen.getByRole('navigation')
    fireEvent.mouseEnter(nav)
    expect(screen.getByText('Library')).toBeInTheDocument()
    expect(screen.getByText('Snips')).toBeInTheDocument()
    fireEvent.mouseLeave(nav)
    expect(screen.queryByText('Library')).toBeNull()
  })
})
