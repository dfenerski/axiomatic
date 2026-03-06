import { describe, it, expect, vi } from 'vitest'

vi.mock('../../hooks/useTheme', () => ({ setTheme: vi.fn() }))

import { buildCommands } from '../commands'

describe('buildCommands', () => {
  it('returns theme commands on non-reader pages', () => {
    const cmds = buildCommands(false, 'light')
    const ids = cmds.map((c) => c.id)
    expect(ids).toContain('theme-system')
    expect(ids).toContain('theme-toggle')
    expect(ids).not.toContain('toggle-outline')
    expect(ids).not.toContain('toggle-learning-tools')
  })

  it('includes reader commands including toggle-learning-tools', () => {
    const cmds = buildCommands(true, 'dark')
    const ids = cmds.map((c) => c.id)
    expect(ids).toContain('toggle-outline')
    expect(ids).toContain('toggle-notes')
    expect(ids).toContain('toggle-bookmarks')
    expect(ids).toContain('toggle-highlights')
    expect(ids).toContain('toggle-zen')
    expect(ids).toContain('toggle-learning-tools')
  })

  it('does not include per-tool commands (snip, loop, pomodoro)', () => {
    const cmds = buildCommands(true, 'light')
    const ids = cmds.map((c) => c.id)
    expect(ids).not.toContain('snip')
    expect(ids).not.toContain('stop-snipping')
    expect(ids).not.toContain('loop-sorted')
    expect(ids).not.toContain('loop-shuffled')
    expect(ids).not.toContain('toggle-pomodoro')
  })

  it('does not include snips-page or stats-page navigation commands', () => {
    const cmds = buildCommands(false, 'light')
    const ids = cmds.map((c) => c.id)
    expect(ids).not.toContain('snips-page')
    expect(ids).not.toContain('stats-page')
  })

  it('shows correct theme toggle label per mode', () => {
    expect(buildCommands(false, 'dark').find((c) => c.id === 'theme-toggle')?.label).toBe('Switch to light mode')
    expect(buildCommands(false, 'light').find((c) => c.id === 'theme-toggle')?.label).toBe('Switch to dark mode')
  })
})
