import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import {
  mockInvoke,
  resetMockInvoke,
  getInvokeCallsFor,
} from '../../../__mocks__/@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core')
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}))

import { useDirectories } from '../useDirectories'
import type { Directory } from '../useDirectories'
import { open } from '@tauri-apps/plugin-dialog'

const dir1: Directory = { id: 1, path: '/home/user/books', label: 'books', added_at: '2024-01-01T00:00:00Z' }
const dir2: Directory = { id: 2, path: '/home/user/papers', label: 'papers', added_at: '2024-02-01T00:00:00Z' }

beforeEach(() => {
  resetMockInvoke()
  vi.mocked(open).mockReset()
})

describe('useDirectories', () => {
  it('loads directories on mount', async () => {
    mockInvoke('list_directories', [dir1, dir2])

    const { result } = renderHook(() => useDirectories())

    await waitFor(() => {
      expect(result.current.directories).toHaveLength(2)
    })

    expect(result.current.directories[0].path).toBe('/home/user/books')
    expect(result.current.directories[1].path).toBe('/home/user/papers')

    const calls = getInvokeCallsFor('list_directories')
    expect(calls).toHaveLength(1)
  })

  it('add opens dialog, calls add_directory, and refreshes', async () => {
    mockInvoke('list_directories', [])
    vi.mocked(open).mockResolvedValue('/home/user/new-lib')
    const newDir: Directory = { id: 3, path: '/home/user/new-lib', label: 'new-lib', added_at: '2024-03-01T00:00:00Z' }
    mockInvoke('add_directory', newDir)

    const { result } = renderHook(() => useDirectories())

    await waitFor(() => {
      expect(result.current.directories).toBeDefined()
    })

    // After add, refresh returns the new directory
    mockInvoke('list_directories', [newDir])

    let returnedDir: Directory | null | undefined
    await act(async () => {
      returnedDir = await result.current.add()
    })

    expect(returnedDir).toEqual(newDir)

    const addCalls = getInvokeCallsFor('add_directory')
    expect(addCalls).toHaveLength(1)
    expect(addCalls[0].args).toEqual({ path: '/home/user/new-lib' })

    await waitFor(() => {
      expect(result.current.directories).toHaveLength(1)
    })
  })

  it('add returns null when dialog is cancelled', async () => {
    mockInvoke('list_directories', [])
    vi.mocked(open).mockResolvedValue(null)

    const { result } = renderHook(() => useDirectories())

    await waitFor(() => {
      expect(result.current.directories).toBeDefined()
    })

    let returnedDir: Directory | null | undefined
    await act(async () => {
      returnedDir = await result.current.add()
    })

    expect(returnedDir).toBeNull()
    expect(getInvokeCallsFor('add_directory')).toHaveLength(0)
  })

  it('remove calls remove_directory and refreshes', async () => {
    mockInvoke('list_directories', [dir1, dir2])
    mockInvoke('remove_directory', null)

    const { result } = renderHook(() => useDirectories())

    await waitFor(() => {
      expect(result.current.directories).toHaveLength(2)
    })

    // After remove, refresh returns only dir2
    mockInvoke('list_directories', [dir2])

    await act(async () => {
      await result.current.remove(1)
    })

    const calls = getInvokeCallsFor('remove_directory')
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toEqual({ id: 1 })

    await waitFor(() => {
      expect(result.current.directories).toHaveLength(1)
      expect(result.current.directories[0].id).toBe(2)
    })
  })
})
