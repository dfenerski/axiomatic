import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BreakOverlay } from '../BreakOverlay'

describe('BreakOverlay', () => {
  it('renders short break text', () => {
    render(<BreakOverlay isLongBreak={false} breakMinutes={5} onDismiss={vi.fn()} />)

    expect(screen.getByText('Take a break')).toBeInTheDocument()
    expect(screen.getByText('5 minutes break starting now')).toBeInTheDocument()
  })

  it('renders long break text', () => {
    render(<BreakOverlay isLongBreak={true} breakMinutes={15} onDismiss={vi.fn()} />)

    expect(screen.getByText('Long break')).toBeInTheDocument()
    expect(screen.getByText('15 minutes long break starting now')).toBeInTheDocument()
  })

  it('uses singular "minute" for 1 minute break', () => {
    render(<BreakOverlay isLongBreak={false} breakMinutes={1} onDismiss={vi.fn()} />)

    expect(screen.getByText('1 minute break starting now')).toBeInTheDocument()
  })

  it('dismiss button calls onDismiss', () => {
    const onDismiss = vi.fn()
    render(<BreakOverlay isLongBreak={false} breakMinutes={5} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByText('Dismiss'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
