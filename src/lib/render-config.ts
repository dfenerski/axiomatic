export interface RenderConfig {
  baseWidth: number
  buffer: number
  maxDpr: number
  maxConcurrent: number
}

const MOBILE_PLATFORMS = new Set(['android', 'ios'])

const MOBILE_CONFIG: RenderConfig = {
  baseWidth: 600,
  buffer: 2,
  maxDpr: 2,
  maxConcurrent: 2,
}

const DESKTOP_CONFIG: RenderConfig = {
  baseWidth: 800,
  buffer: 3,
  maxDpr: 3,
  maxConcurrent: 3,
}

export function getRenderConfig(os: string): RenderConfig {
  return MOBILE_PLATFORMS.has(os) ? MOBILE_CONFIG : DESKTOP_CONFIG
}
