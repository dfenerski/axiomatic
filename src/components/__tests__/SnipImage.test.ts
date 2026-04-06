import { describe, it, expect } from 'vitest'
import { resolveSnipPath } from '../SnipImage'
import type { Snip } from '../../hooks/useSnips'

function makeSnip(overrides: Partial<Snip> = {}): Snip {
  return {
    id: '1',
    slug: '1_lecture',
    full_path: '/home/user/uni/pka/lecture.pdf',
    page: 1,
    label: '',
    x: 0, y: 0, width: 1, height: 1,
    created_at: '',
    tags: [],
    ...overrides,
  }
}

describe('resolveSnipPath', () => {
  it('returns full_path when no pathMap provided', () => {
    const snip = makeSnip()
    expect(resolveSnipPath(snip)).toBe('/home/user/uni/pka/lecture.pdf')
  })

  it('resolves by slug (primary lookup, same device)', () => {
    const snip = makeSnip({ slug: '1_lecture' })
    const pathMap = new Map([
      ['1_lecture', '/same/device/pka/lecture.pdf'],
      ['2_lecture', '/same/device/tml/lecture.pdf'],
    ])
    expect(resolveSnipPath(snip, pathMap)).toBe('/same/device/pka/lecture.pdf')
  })

  it('resolves by dir_path + filename when slug mismatches (cross-device)', () => {
    // Desktop slug=11_lekciq4, mobile slug=3_lekciq4 (different dir_ids)
    const snip = makeSnip({
      slug: '11_lekciq4',
      full_path: '/home/user/fmi-course-mesi/Lekciq4.pdf',
    })
    const pathMap = new Map([
      ['3_lekciq4', '/mobile/fmi-course-mesi/Lekciq4.pdf'],
      ['/mobile/fmi-course-mesi/:Lekciq4.pdf', '/mobile/fmi-course-mesi/Lekciq4.pdf'],
      ['4_lekciq4', '/mobile/fmi-course-tml/lekcii/Lekciq4.pdf'],
      ['/mobile/fmi-course-tml/:Lekciq4.pdf', '/mobile/fmi-course-tml/lekcii/Lekciq4.pdf'],
    ])
    // With dirPath, resolves to the correct directory
    expect(resolveSnipPath(snip, pathMap, '/mobile/fmi-course-mesi/')).toBe(
      '/mobile/fmi-course-mesi/Lekciq4.pdf',
    )
  })

  it('does not return wrong book when filenames collide (regression)', () => {
    // Two directories both have "Lekciq4.pdf" — dirPath disambiguates
    const snip = makeSnip({
      slug: '11_lekciq4',
      full_path: '/desktop/fmi-course-tml/lekcii/Lekciq4.pdf',
    })
    const pathMap = new Map([
      ['/mobile/fmi-course-mesi/:Lekciq4.pdf', '/mobile/fmi-course-mesi/Lekciq4.pdf'],
      ['/mobile/fmi-course-tml/:Lekciq4.pdf', '/mobile/fmi-course-tml/lekcii/Lekciq4.pdf'],
    ])
    expect(resolveSnipPath(snip, pathMap, '/mobile/fmi-course-tml/')).toBe(
      '/mobile/fmi-course-tml/lekcii/Lekciq4.pdf',
    )
  })

  it('reads dirPath from SnipWithDir when no explicit dirPath given', () => {
    const snip = {
      ...makeSnip({
        slug: '11_lekciq4',
        full_path: '/desktop/mesi/Lekciq4.pdf',
      }),
      dirPath: '/mobile/mesi/',
      dirLabel: 'mesi',
    }
    const pathMap = new Map([
      ['/mobile/mesi/:Lekciq4.pdf', '/mobile/mesi/Lekciq4.pdf'],
      ['/mobile/tml/:Lekciq4.pdf', '/mobile/tml/lekcii/Lekciq4.pdf'],
    ])
    // No explicit dirPath arg — resolveSnipPath reads snip.dirPath
    expect(resolveSnipPath(snip, pathMap)).toBe('/mobile/mesi/Lekciq4.pdf')
  })

  it('falls back to filename match when no slug or dir match', () => {
    const snip = makeSnip({ slug: '1_book', full_path: '/desktop/lib/book.pdf' })
    const pathMap = new Map([
      ['3_book', '/mobile/lib/book.pdf'],
    ])
    expect(resolveSnipPath(snip, pathMap)).toBe('/mobile/lib/book.pdf')
  })

  it('returns original full_path when nothing matches', () => {
    const snip = makeSnip({ slug: '1_gone', full_path: '/old/path/gone.pdf' })
    const pathMap = new Map([
      ['2_other', '/new/path/other.pdf'],
    ])
    expect(resolveSnipPath(snip, pathMap)).toBe('/old/path/gone.pdf')
  })
})
