import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PomodoroTimer } from '../PomodoroTimer'

vi.mock('@tauri-apps/api/core')

// Mock createPortal to render inline (break overlay)
vi.mock('react-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-dom')>()
  return { ...mod, createPortal: (node: React.ReactNode) => node }
})

// Reset localStorage before each test so pomodoro config is clean
beforeEach(() => {
  localStorage.clear()
})

describe('PomodoroTimer', () => {
  // text counter instead of dots
  it('shows text counter "0/4" instead of dots', () => {
    render(<PomodoroTimer zenMode={false} />)
    expect(screen.getByText('0/4')).toBeInTheDocument()
  })

  // phase label inside timer button (dimmed, only when running or break)
  it('does not show standalone phase label when idle in work phase', () => {
    render(<PomodoroTimer zenMode={false} />)
    const buttons = screen.getAllByRole('button')
    const timerBtn = buttons.find((b) => b.getAttribute('aria-label')?.includes('timer'))
    expect(timerBtn).toBeDefined()
    expect(screen.queryByText('work')).toBeNull()
    expect(screen.queryByText('break')).toBeNull()
  })

  // popover has section headers
  it('shows "Duration", "Notifications", and "Timer" section headers in popover', () => {
    render(<PomodoroTimer zenMode={false} />)
    const settingsBtn = screen.getByLabelText('Timer settings')
    fireEvent.click(settingsBtn)
    expect(screen.getByText('Duration')).toBeInTheDocument()
    expect(screen.getByText('Notifications')).toBeInTheDocument()
    expect(screen.getByText('Timer')).toBeInTheDocument()
  })

  // Reset and Skip always visible
  it('shows Reset and Skip buttons in popover even when timer is not running', () => {
    render(<PomodoroTimer zenMode={false} />)
    const settingsBtn = screen.getByLabelText('Timer settings')
    fireEvent.click(settingsBtn)
    expect(screen.getByText('Reset')).toBeInTheDocument()
    expect(screen.getByText('Skip')).toBeInTheDocument()
  })

  // chime toggle
  it('chime toggle changes audioEnabled when clicked', () => {
    render(<PomodoroTimer zenMode={false} />)
    const settingsBtn = screen.getByLabelText('Timer settings')
    fireEvent.click(settingsBtn)
    const toggle = screen.getByRole('switch')
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })

  // skip phase
  it('has a Skip button that advances phase', () => {
    render(<PomodoroTimer zenMode={false} />)
    const settingsBtn = screen.getByLabelText('Timer settings')
    fireEvent.click(settingsBtn)
    const skipBtn = screen.getByText('Skip')
    fireEvent.click(skipBtn)
    expect(screen.getByText('1/4')).toBeInTheDocument()
  })

  // Presets: 45/10, 60/10, 90/15
  it('shows three preset buttons: 45/10, 60/10, 90/15', () => {
    render(<PomodoroTimer zenMode={false} />)
    const settingsBtn = screen.getByLabelText('Timer settings')
    fireEvent.click(settingsBtn)
    expect(screen.getByText('45/10')).toBeInTheDocument()
    expect(screen.getByText('60/10')).toBeInTheDocument()
    expect(screen.getByText('90/15')).toBeInTheDocument()
  })

  it('does not show old 25/5 or 50/10 presets', () => {
    render(<PomodoroTimer zenMode={false} />)
    const settingsBtn = screen.getByLabelText('Timer settings')
    fireEvent.click(settingsBtn)
    expect(screen.queryByText('25/5')).toBeNull()
    expect(screen.queryByText('50/10')).toBeNull()
  })

  // Settings icon is an hourglass, not a sun or gear
  it('settings button uses an hourglass icon (no sun rays)', () => {
    render(<PomodoroTimer zenMode={false} />)
    const settingsBtn = screen.getByLabelText('Timer settings')
    const svg = settingsBtn.querySelector('svg')
    expect(svg).toBeTruthy()
    const paths = svg!.querySelectorAll('path')
    const hasSunRays = Array.from(paths).some((p) =>
      (p.getAttribute('d') ?? '').includes('M12 1v2'),
    )
    expect(hasSunRays).toBe(false)
    // Should NOT have gear teeth path either
    const hasGear = Array.from(paths).some((p) =>
      (p.getAttribute('d') ?? '').includes('M19.4 15'),
    )
    expect(hasGear).toBe(false)
  })

  // NEW: chime toggle has shrink-0 to prevent cutoff
  it('chime toggle switch has shrink-0 class', () => {
    render(<PomodoroTimer zenMode={false} />)
    const settingsBtn = screen.getByLabelText('Timer settings')
    fireEvent.click(settingsBtn)
    const toggle = screen.getByRole('switch')
    expect(toggle.className).toContain('shrink-0')
  })

})
