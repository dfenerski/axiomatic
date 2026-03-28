import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { mockInvoke, resetMockInvoke } from '../../../__mocks__/@tauri-apps/api/core'

// jsdom doesn't have matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

vi.mock('@tauri-apps/api/core')
vi.mock('@tauri-apps/api/window')

// Import Layout after mocks are set up
const { Layout } = await import('../Layout')

beforeEach(() => {
  resetMockInvoke()
})

function renderLayout(platform: string) {
  mockInvoke('get_platform', platform)
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<div data-testid="outlet">outlet</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('Layout', () => {
  it('does not render Titlebar on android', async () => {
    renderLayout('android')
    await waitFor(() => {
      expect(screen.getByTestId('outlet')).toBeInTheDocument()
    })
    // Mobile gets the simple layout — no Titlebar, no p-2 wrapper
    expect(screen.queryByText('Axiomatic')).not.toBeInTheDocument()
  })

  it('does not render outer p-2 padding on android', async () => {
    const { container } = renderLayout('android')
    await waitFor(() => {
      expect(screen.getByTestId('outlet')).toBeInTheDocument()
    })
    const outerDiv = container.firstElementChild as HTMLElement
    expect(outerDiv.className).not.toContain('p-2')
  })

  it('renders p-2 wrapper on macos', async () => {
    const { container } = renderLayout('macos')
    await waitFor(() => {
      expect(screen.getByTestId('outlet')).toBeInTheDocument()
    })
    const outerDiv = container.firstElementChild as HTMLElement
    expect(outerDiv.className).toContain('p-2')
  })

  it('renders Titlebar text on macos', async () => {
    renderLayout('macos')
    await waitFor(() => {
      expect(screen.getByTestId('outlet')).toBeInTheDocument()
    })
    expect(screen.getByText('Axiomatic')).toBeInTheDocument()
  })

  it('does not render outer p-2 padding on linux', async () => {
    const { container } = renderLayout('linux')
    await waitFor(() => {
      expect(screen.getByTestId('outlet')).toBeInTheDocument()
    })
    const outerDiv = container.firstElementChild as HTMLElement
    expect(outerDiv.className).not.toContain('p-2')
  })
})
