import { describe, it, expect } from 'vitest'
import { buildPdfiumUrl } from '../pdfium-url'

describe('buildPdfiumUrl', () => {
  it('builds pdfium:// URL for linux', () => {
    const url = buildPdfiumUrl({ path: '/a.pdf', page: 1, width: 800, dpr: 2 }, 'linux')
    expect(url).toBe('pdfium://localhost/render?path=%2Fa.pdf&page=1&width=800&dpr=2')
  })

  it('builds http://pdfium.localhost/ URL for android', () => {
    const url = buildPdfiumUrl({ path: '/a.pdf', page: 1, width: 800, dpr: 2 }, 'android')
    expect(url).toBe('http://pdfium.localhost/render?path=%2Fa.pdf&page=1&width=800&dpr=2')
  })

  it('builds pdfium:// URL for ios', () => {
    const url = buildPdfiumUrl({ path: '/a.pdf', page: 1, width: 800, dpr: 2 }, 'ios')
    expect(url).toBe('pdfium://localhost/render?path=%2Fa.pdf&page=1&width=800&dpr=2')
  })

  it('encodes paths with spaces', () => {
    const url = buildPdfiumUrl({ path: '/my books/a.pdf', page: 3, width: 600 }, 'linux')
    expect(url).toBe('pdfium://localhost/render?path=%2Fmy%20books%2Fa.pdf&page=3&width=600&dpr=1')
  })

  it('defaults dpr to 1 when omitted', () => {
    const url = buildPdfiumUrl({ path: '/a.pdf', page: 1, width: 800 }, 'linux')
    expect(url).toBe('pdfium://localhost/render?path=%2Fa.pdf&page=1&width=800&dpr=1')
  })

  it('builds http URL for android with spaces in path', () => {
    const url = buildPdfiumUrl({ path: '/my books/a.pdf', page: 2, width: 600, dpr: 3 }, 'android')
    expect(url).toBe('http://pdfium.localhost/render?path=%2Fmy%20books%2Fa.pdf&page=2&width=600&dpr=3')
  })
})
