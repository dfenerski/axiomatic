import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockInvoke, resetMockInvoke, getInvokeCallsFor } from '../../__mocks__/@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core')

import { SlugMigrationDialog } from '../SlugMigrationDialog'
import type { OrphanCandidate } from '../SlugMigrationDialog'

const candidates: OrphanCandidate[] = [
  {
    old_slug: 'old_book_name',
    new_slug_candidate: 'new_book_name',
    dir_path: '/library',
    evidence: ['highlights', 'notes'],
  },
  {
    old_slug: 'another_old',
    new_slug_candidate: 'another_new',
    dir_path: '/library',
    evidence: ['progress'],
  },
]

beforeEach(() => {
  resetMockInvoke()
  localStorage.clear()
})

describe('SlugMigrationDialog', () => {
  it('renders all orphaned slug candidates', () => {
    const onComplete = vi.fn()
    render(<SlugMigrationDialog candidates={candidates} onComplete={onComplete} />)

    expect(screen.getByText('old_book_name')).toBeInTheDocument()
    expect(screen.getByText('new_book_name')).toBeInTheDocument()
    expect(screen.getByText('another_old')).toBeInTheDocument()
    expect(screen.getByText('another_new')).toBeInTheDocument()
    expect(screen.getByText('Renamed files detected')).toBeInTheDocument()
  })

  it('shows evidence for each candidate', () => {
    render(<SlugMigrationDialog candidates={candidates} onComplete={vi.fn()} />)

    expect(screen.getByText('Data in: highlights, notes')).toBeInTheDocument()
    expect(screen.getByText('Data in: progress')).toBeInTheDocument()
  })

  it('accept calls migrate_slug IPC and shows Migrated status', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    mockInvoke('migrate_slug', null)

    render(<SlugMigrationDialog candidates={candidates} onComplete={onComplete} />)

    // Find all Accept buttons, click the first one
    const acceptButtons = screen.getAllByText('Accept')
    expect(acceptButtons.length).toBe(2)

    await user.click(acceptButtons[0])

    // Verify IPC call
    const calls = getInvokeCallsFor('migrate_slug')
    expect(calls.length).toBe(1)
    expect(calls[0].args?.oldSlug).toBe('old_book_name')
    expect(calls[0].args?.newSlug).toBe('new_book_name')
    expect(calls[0].args?.dirPath).toBe('/library')

    // Status should show "Migrated"
    expect(screen.getByText('Migrated')).toBeInTheDocument()
  })

  it('reject marks the candidate as Rejected without IPC call', async () => {
    const user = userEvent.setup()
    render(<SlugMigrationDialog candidates={candidates} onComplete={vi.fn()} />)

    const rejectButtons = screen.getAllByText('Reject')
    await user.click(rejectButtons[0])

    // No migrate_slug call
    expect(getInvokeCallsFor('migrate_slug').length).toBe(0)

    // Status should show "Rejected"
    expect(screen.getByText('Rejected')).toBeInTheDocument()
  })

  it('dismiss calls onComplete', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<SlugMigrationDialog candidates={candidates} onComplete={onComplete} />)

    // Before all are resolved, button says "Dismiss"
    const dismissButton = screen.getByText('Dismiss')
    await user.click(dismissButton)

    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('done button appears when all candidates are resolved', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    mockInvoke('migrate_slug', null)

    render(<SlugMigrationDialog candidates={candidates} onComplete={onComplete} />)

    // Resolve first: accept
    const acceptButtons = screen.getAllByText('Accept')
    await user.click(acceptButtons[0])

    // Resolve second: reject
    const rejectButtons = screen.getAllByText('Reject')
    await user.click(rejectButtons[0])

    // Now the button should say "Done"
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('shows resolved counter', async () => {
    const user = userEvent.setup()
    mockInvoke('migrate_slug', null)

    render(<SlugMigrationDialog candidates={candidates} onComplete={vi.fn()} />)

    // Initially 0/2 resolved
    expect(screen.getByText('0/2 resolved')).toBeInTheDocument()

    // Accept first
    const acceptButtons = screen.getAllByText('Accept')
    await user.click(acceptButtons[0])

    expect(screen.getByText('1/2 resolved')).toBeInTheDocument()
  })
})
