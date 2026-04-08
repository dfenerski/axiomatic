/**
 * Mock for @tauri-apps/api/core — intercepts `invoke` calls in tests.
 *
 * Usage:
 *   import { mockInvoke, mockInvokeError, resetMockInvoke, getInvokeCalls } from './__mocks__/@tauri-apps/api/core'
 *
 *   mockInvoke('list_snips', [])          // configure return value
 *   mockInvokeError('save_progress', 'disk full')  // configure error
 *   resetMockInvoke()                     // clear all overrides + call log
 *   getInvokeCalls()                      // [{ command: 'list_snips', args: {...} }, ...]
 */

import { vi } from 'vitest'

interface InvokeCall {
  command: string
  args: Record<string, unknown> | undefined
}

const callLog: InvokeCall[] = []
const returnOverrides = new Map<string, unknown>()
const errorOverrides = new Map<string, string>()
const defaultReturns = new Map<string, unknown>()

// Default fallback values for common commands so tests don't explode
defaultReturns.set('get_all_progress', {})
defaultReturns.set('save_progress', null)
defaultReturns.set('get_starred', [])
defaultReturns.set('toggle_starred', true)
defaultReturns.set('list_snips', [])
defaultReturns.set('get_xp', 0)
defaultReturns.set('increment_xp', 1)
defaultReturns.set('create_snip', {})
defaultReturns.set('delete_snip', null)
defaultReturns.set('list_highlights', [])
defaultReturns.set('create_highlight', {})
defaultReturns.set('delete_highlight', null)
defaultReturns.set('delete_highlight_group', null)
defaultReturns.set('migrate_slug', null)
defaultReturns.set('prerender_pages', null)
defaultReturns.set('get_platform', 'linux')
defaultReturns.set('get_all_book_status', {})
defaultReturns.set('set_book_status', null)
defaultReturns.set('set_snip_status', null)
defaultReturns.set('bulk_set_snip_status', null)
defaultReturns.set('get_snip_status_counts', {})

/**
 * Set a return value for a specific command name.
 */
export function mockInvoke(command: string, returnValue: unknown): void {
  returnOverrides.set(command, returnValue)
}

/**
 * Configure a command to throw with the given error message.
 */
export function mockInvokeError(command: string, errorMessage: string): void {
  errorOverrides.set(command, errorMessage)
}

/**
 * Return all recorded invoke calls (command + args).
 */
export function getInvokeCalls(): InvokeCall[] {
  return [...callLog]
}

/**
 * Return invoke calls filtered to a specific command name.
 */
export function getInvokeCallsFor(command: string): InvokeCall[] {
  return callLog.filter((c) => c.command === command)
}

/**
 * Reset all overrides and clear the call log.
 */
export function resetMockInvoke(): void {
  callLog.length = 0
  returnOverrides.clear()
  errorOverrides.clear()
}

/**
 * The mock `invoke` function. Records every call, checks for error
 * overrides, then return overrides, then default returns.
 */
export const invoke = vi.fn(
  async (command: string, args?: Record<string, unknown>): Promise<unknown> => {
    callLog.push({ command, args })

    if (errorOverrides.has(command)) {
      throw new Error(errorOverrides.get(command))
    }

    if (returnOverrides.has(command)) {
      const val = returnOverrides.get(command)
      // Support callable overrides for dynamic responses
      if (typeof val === 'function') {
        return (val as (args?: Record<string, unknown>) => unknown)(args)
      }
      return val
    }

    if (defaultReturns.has(command)) {
      return defaultReturns.get(command)
    }

    return null
  },
)
