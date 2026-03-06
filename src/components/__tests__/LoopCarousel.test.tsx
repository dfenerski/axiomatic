import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { LoopCarousel } from '../LoopCarousel'
import type { Snip } from '../../hooks/useSnips'

function makeSnip(overrides: Partial<Snip> = {}): Snip {
  return {
    id: 'snip-1',
    slug: 'test_book',
    full_path: '/dir/test_book.pdf',
    page: 1,
    label: 'Definition 1.1',
    x: 0.1,
    y: 0.2,
    width: 0.5,
    height: 0.3,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('LoopCarousel', () => {
  it('renders the snip label', async () => {
    const snips = [makeSnip({ label: 'Theorem 3.2' })]
    const onIncrementXp = vi.fn().mockResolvedValue(1)
    const onExit = vi.fn()

    render(
      <LoopCarousel
        snips={snips}
        xp={0}
        onIncrementXp={onIncrementXp}
        onExit={onExit}
        shuffled={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Theorem 3.2')).toBeInTheDocument()
    })
  })

  it('shows "No snips to review." when snips is empty', () => {
    render(
      <LoopCarousel
        snips={[]}
        xp={0}
        onIncrementXp={vi.fn().mockResolvedValue(0)}
        onExit={vi.fn()}
        shuffled={false}
      />,
    )

    expect(screen.getByText('No snips to review.')).toBeInTheDocument()
  })

  it('displays XP counter', async () => {
    const snips = [makeSnip()]
    render(
      <LoopCarousel
        snips={snips}
        xp={42}
        onIncrementXp={vi.fn().mockResolvedValue(43)}
        onExit={vi.fn()}
        shuffled={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('42 XP')).toBeInTheDocument()
    })
  })

  it('navigating next with j key updates index and calls onIncrementXp', async () => {
    const snips = [
      makeSnip({ id: 'snip-1', label: 'Card 1' }),
      makeSnip({ id: 'snip-2', label: 'Card 2' }),
    ]
    const onIncrementXp = vi.fn().mockResolvedValue(1)

    render(
      <LoopCarousel
        snips={snips}
        xp={0}
        onIncrementXp={onIncrementXp}
        onExit={vi.fn()}
        shuffled={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Card 1')).toBeInTheDocument()
    })

    // Verify initial counter
    expect(screen.getByText('1 / 2')).toBeInTheDocument()

    // Press j to advance
    fireEvent.keyDown(window, { key: 'j' })

    await waitFor(() => {
      expect(screen.getByText('Card 2')).toBeInTheDocument()
    })
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
    expect(onIncrementXp).toHaveBeenCalledTimes(1)
  })

  it('navigating prev with k key goes back', async () => {
    const snips = [
      makeSnip({ id: 'snip-1', label: 'Card 1' }),
      makeSnip({ id: 'snip-2', label: 'Card 2' }),
    ]
    const onIncrementXp = vi.fn().mockResolvedValue(1)

    render(
      <LoopCarousel
        snips={snips}
        xp={0}
        onIncrementXp={onIncrementXp}
        onExit={vi.fn()}
        shuffled={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Card 1')).toBeInTheDocument()
    })

    // Go to next
    fireEvent.keyDown(window, { key: 'j' })
    await waitFor(() => {
      expect(screen.getByText('Card 2')).toBeInTheDocument()
    })

    // Go back
    fireEvent.keyDown(window, { key: 'k' })
    await waitFor(() => {
      expect(screen.getByText('Card 1')).toBeInTheDocument()
    })
  })

  it('Reveal button shows SnipImage content area', async () => {
    const snips = [makeSnip({ label: 'Test Card' })]

    render(
      <LoopCarousel
        snips={snips}
        xp={0}
        onIncrementXp={vi.fn().mockResolvedValue(1)}
        onExit={vi.fn()}
        shuffled={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Test Card')).toBeInTheDocument()
    })

    // Reveal button should be visible
    expect(screen.getByText('Reveal')).toBeInTheDocument()

    // Click reveal
    fireEvent.click(screen.getByText('Reveal'))

    // After reveal, the Reveal button should be gone (replaced by canvas)
    expect(screen.queryByText('Reveal')).not.toBeInTheDocument()
  })

  it('Escape key calls onExit', async () => {
    const onExit = vi.fn()
    const snips = [makeSnip()]

    render(
      <LoopCarousel
        snips={snips}
        xp={0}
        onIncrementXp={vi.fn().mockResolvedValue(0)}
        onExit={onExit}
        shuffled={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Definition 1.1')).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('XP counter updates after navigation', async () => {
    const snips = [
      makeSnip({ id: 'snip-1', label: 'A' }),
      makeSnip({ id: 'snip-2', label: 'B' }),
    ]
    const onIncrementXp = vi.fn().mockResolvedValue(10)

    render(
      <LoopCarousel
        snips={snips}
        xp={5}
        onIncrementXp={onIncrementXp}
        onExit={vi.fn()}
        shuffled={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('5 XP')).toBeInTheDocument()
    })

    // Navigate next
    fireEvent.keyDown(window, { key: 'j' })

    await waitFor(() => {
      expect(screen.getByText('10 XP')).toBeInTheDocument()
    })
  })
})
