import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'

vi.mock('@tauri-apps/api/core')
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }))

import { mockInvoke, mockInvokeError, resetMockInvoke } from '../../../__mocks__/@tauri-apps/api/core'
import { PdfViewer } from '../PdfViewer'
import type { DocumentInfo } from '../../hooks/useDocument'

const docInfo: DocumentInfo = {
  doc_id: '/test.pdf',
  page_count: 5,
  pages: Array.from({ length: 5 }, () => ({
    width_pts: 612,
    height_pts: 792,
    aspect_ratio: 612 / 792,
  })),
  title: 'Test',
}

beforeEach(() => {
  resetMockInvoke()
})

describe('PdfViewer warm-page rendering', () => {
  it('shows placeholders before prerender resolves, then images after', async () => {
    let resolveAll!: () => void
    const gate = new Promise<void>((r) => { resolveAll = r })
    mockInvoke('prerender_pages', () => gate)

    const { container } = render(
      <PdfViewer docInfo={docInfo} fullPath="/test.pdf" />,
    )

    // Page containers render immediately with placeholder divs
    await waitFor(() => {
      expect(container.querySelectorAll('[data-page-number]').length).toBeGreaterThan(0)
    })
    // No <img> tags — pages are not warm yet
    expect(container.querySelectorAll('img.pdf-page-img')).toHaveLength(0)

    // Release prerender gate → pages become warm → <img> tags mount
    await act(async () => { resolveAll() })

    await waitFor(() => {
      expect(container.querySelectorAll('img.pdf-page-img').length).toBeGreaterThan(0)
    })
  })

  it('sizes page containers per-page when aspect ratios differ', async () => {
    // Regression: pages shorter than A4 were stretched to A4 height because
    // open_document used to replicate page-0 dimensions to all pages.
    const mixedDoc: DocumentInfo = {
      doc_id: '/mixed.pdf',
      page_count: 3,
      pages: [
        { width_pts: 612, height_pts: 792, aspect_ratio: 612 / 792 },   // A4
        { width_pts: 612, height_pts: 400, aspect_ratio: 612 / 400 },   // shorter
        { width_pts: 612, height_pts: 792, aspect_ratio: 612 / 792 },   // A4 again
      ],
      title: 'Mixed',
    }

    mockInvoke('prerender_pages', () => Promise.resolve())

    const { container } = render(
      <PdfViewer docInfo={mixedDoc} fullPath="/mixed.pdf" />,
    )

    await waitFor(() => {
      expect(container.querySelectorAll('[data-page-number]').length).toBeGreaterThan(0)
    })

    const pages = container.querySelectorAll('[data-page-number]')
    const heights = Array.from(pages).map(
      (el) => parseFloat((el as HTMLElement).style.height),
    )

    // Page 2 (shorter) must have a smaller container height than pages 1 and 3
    expect(heights[1]).toBeLessThan(heights[0])
    expect(heights[1]).toBeLessThan(heights[2])
    // Pages 1 and 3 (same A4 ratio) must have equal heights
    expect(heights[0]).toBeCloseTo(heights[2], 1)
  })

  it('renders images even when prerender_pages fails', async () => {
    mockInvokeError('prerender_pages', 'render thread crashed')

    const { container } = render(
      <PdfViewer docInfo={docInfo} fullPath="/test.pdf" />,
    )

    // Fallback: .catch(markWarm) still marks pages warm → <img> tags mount
    await waitFor(() => {
      expect(container.querySelectorAll('img.pdf-page-img').length).toBeGreaterThan(0)
    })
  })
})
