import { describe, it, expect } from 'vitest'
import { getPlatformType } from '../platform'

describe('getPlatformType', () => {
  it('classifies linux as desktop', () => {
    const info = getPlatformType('linux')
    expect(info).toEqual({ os: 'linux', isMobile: false, isDesktop: true })
  })

  it('classifies android as mobile', () => {
    const info = getPlatformType('android')
    expect(info).toEqual({ os: 'android', isMobile: true, isDesktop: false })
  })

  it('classifies ios as mobile', () => {
    const info = getPlatformType('ios')
    expect(info).toEqual({ os: 'ios', isMobile: true, isDesktop: false })
  })

  it('classifies macos as desktop', () => {
    const info = getPlatformType('macos')
    expect(info).toEqual({ os: 'macos', isMobile: false, isDesktop: true })
  })

  it('classifies windows as desktop', () => {
    const info = getPlatformType('windows')
    expect(info).toEqual({ os: 'windows', isMobile: false, isDesktop: true })
  })
})
