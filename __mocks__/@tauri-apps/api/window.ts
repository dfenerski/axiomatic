import { vi } from 'vitest'

const windowMock = {
  onCloseRequested: vi.fn().mockResolvedValue(vi.fn()),
  onResized: vi.fn().mockResolvedValue(vi.fn()),
  close: vi.fn().mockResolvedValue(undefined),
  minimize: vi.fn().mockResolvedValue(undefined),
  toggleMaximize: vi.fn().mockResolvedValue(undefined),
  isMaximized: vi.fn().mockResolvedValue(false),
  startDragging: vi.fn().mockResolvedValue(undefined),
  setTitle: vi.fn().mockResolvedValue(undefined),
  innerSize: vi.fn().mockResolvedValue({ width: 1920, height: 1080 }),
  setTheme: vi.fn().mockResolvedValue(undefined),
}

export function getCurrentWindow() {
  return windowMock
}
