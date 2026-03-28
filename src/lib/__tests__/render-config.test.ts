import { describe, it, expect } from 'vitest'
import { getRenderConfig } from '../render-config'

describe('getRenderConfig', () => {
  it('returns desktop config for linux', () => {
    expect(getRenderConfig('linux')).toEqual({
      baseWidth: 800,
      buffer: 3,
      maxDpr: 3,
      maxConcurrent: 3,
    })
  })

  it('returns mobile config for android', () => {
    expect(getRenderConfig('android')).toEqual({
      baseWidth: 600,
      buffer: 2,
      maxDpr: 2,
      maxConcurrent: 2,
    })
  })

  it('returns mobile config for ios', () => {
    expect(getRenderConfig('ios')).toEqual({
      baseWidth: 600,
      buffer: 2,
      maxDpr: 2,
      maxConcurrent: 2,
    })
  })

  it('returns desktop config for macos', () => {
    expect(getRenderConfig('macos')).toEqual({
      baseWidth: 800,
      buffer: 3,
      maxDpr: 3,
      maxConcurrent: 3,
    })
  })
})
