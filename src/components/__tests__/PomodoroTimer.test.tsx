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
  // ac-150: text counter instead of dots
  it('shows text counter "0/4" instead of dots', () => {
    render(<PomodoroTimer zenMode={false} />)
    expect(screen.getByText('0/4')).toBeInTheDocument()
  })

  // ac-150: phase label inside timer button (dimmed, only when running or break)
  it('does not show standalone phase label when idle in work phase', () => {
    render(<PomodoroTimer zenMode={false} />)
    // The phase label should NOT be a standalone <span> outside the button
    // It should only appear inside the button when running or in break
    const buttons = screen.getAllByRole('button')
    const timerBtn = buttons.find((b) => b.getAttribute('aria-label')?.includes('timer'))
    expect(timerBtn).toBeDefined()
    // When idle in work phase, no phase suffix should be visible
    expect(screen.queryByText('work')).toBeNull()
    expect(screen.queryByText('break')).toBeNull()
  })

  // ac-153: popover has section headers
  it('shows "Duration", "Notifications", and "Timer" section headers in popover', () => {
    render(<PomodoroTimer zenMode={false} />)
    // Open the settings popover
    const settingsBtn = screen.getByLabelText('Timer settings')
    fireEvent.click(settingsBtn)
    expect(screen.getByText('Duration')).toBeInTheDocument()
    expect(screen.getByText('Notifications')).toBeInTheDocument()
    expect(screen.getByText('Timer')).toBeInTheDocument()
  })

  // ac-150: Reset and Skip always visible in popover (not gated on timer.running)
  it('shows Reset and Skip buttons in popover even when timer is not running', () => {
    render(<PomodoroTimer zenMode={false} />)
    const settingsBtn = screen.getByLabelText('Timer settings')
    fireEvent.click(settingsBtn)
    expect(screen.getByText('Reset')).toBeInTheDocument()
    expect(screen.getByText('Skip')).toBeInTheDocument()
  })

  // ac-152: chime toggle not intercepted by parent
  it('chime toggle changes audioEnabled when clicked', () => {
    render(<PomodoroTimer zenMode={false} />)
    const settingsBtn = screen.getByLabelText('Timer settings')
    fireEvent.click(settingsBtn)
    const toggle = screen.getByRole('switch')
    // Default is audioEnabled: true
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(toggle)
    // Should now be false
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })

  // ac-151: skipPhase exists and is accessible
  it('has a Skip button that advances phase', () => {
    render(<PomodoroTimer zenMode={false} />)
    const settingsBtn = screen.getByLabelText('Timer settings')
    fireEvent.click(settingsBtn)
    const skipBtn = screen.getByText('Skip')
    expect(skipBtn).toBeInTheDocument()
    fireEvent.click(skipBtn)
    // After skipping work phase, we should be in break — phase label should appear
    // Re-check: the counter should show 1/4 (one pomodoro completed by skip)
    expect(screen.getByText('1/4')).toBeInTheDocument()
  })
})
