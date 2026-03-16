import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ZoomableSnipImage } from '../ZoomableSnipImage'
import type { Snip } from '../../hooks/useSnips'

// Track all observer instances so tests can simulate resize events
type ResizeCallback = (entries: { contentRect: { width: number; height: number } }[]) => void
const observers: { el: Element; cb: ResizeCallback; disconnected: boolean }[] = []

class TestableResizeObserver {
  private cb: ResizeCallback
  constructor(cb: ResizeCallback) {
    this.cb = cb
  }

  observe(el: Element) {
    observers.push({ el, cb: this.cb, disconnected: false })
    // Fire immediately with the element's current size (simulates real behavior)
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      this.cb([{ contentRect: { width: rect.width, height: rect.height } }])
    }
  }

  unobserve() {}

  disconnect() {
    for (const o of observers) {
      if (o.cb === this.cb) o.disconnected = true
    }
  }
}

globalThis.ResizeObserver = TestableResizeObserver as unknown as typeof ResizeObserver

function fireResize(el: Element, width: number, height: number) {
  for (const o of observers) {
    if (o.el === el && !o.disconnected) {
      o.cb([{ contentRect: { width, height } }])
    }
  }
}

function makeSnip(overrides: Partial<Snip> = {}): Snip {
  return {
    id: 'snip-1',
    slug: 'test_book',
    full_path: '/dir/test_book.pdf',
    page: 1,
    label: 'Snip 1',
    x: 0.1,
    y: 0.2,
    width: 0.5,
    height: 0.3,
    created_at: '2024-01-01T00:00:00Z',
    tags: [],
    ...overrides,
  }
}

beforeEach(() => {
  observers.length = 0
})

describe('ZoomableSnipImage', () => {
  it('updates contentSize when canvas resizes after initial measurement', () => {
    const snip = makeSnip()
    render(<ZoomableSnipImage snip={snip} />)

    const zoomContainer = screen.getByTestId('snip-zoom-container')
    const scrollWrapper = zoomContainer.parentElement!

    // Simulate: observer initially fired with small size (stale canvas from previous snip)
    // Then canvas loads new image and resizes to larger dimensions
    act(() => {
      fireResize(zoomContainer, 800, 600)
    })

    // The container should reflect the NEW size, not stay at the old one
    expect(scrollWrapper.style.width).toBe('800px')
    expect(scrollWrapper.style.height).toBe('600px')
  })

  it('picks up late canvas resize after observer initially fired with stale size', () => {
    const snip = makeSnip()
    render(<ZoomableSnipImage snip={snip} />)

    const zoomContainer = screen.getByTestId('snip-zoom-container')
    const scrollWrapper = zoomContainer.parentElement!

    // Step 1: observer fires with stale small size (old canvas)
    act(() => {
      fireResize(zoomContainer, 300, 200)
    })

    expect(scrollWrapper.style.width).toBe('300px')
    expect(scrollWrapper.style.height).toBe('200px')

    // Step 2: canvas loads new image, resizes to actual dimensions
    act(() => {
      fireResize(zoomContainer, 800, 600)
    })

    // Container MUST update to the new size
    expect(scrollWrapper.style.width).toBe('800px')
    expect(scrollWrapper.style.height).toBe('600px')
  })
})
