import { describe, it, expect, beforeEach } from 'vitest'
import {
  setReaderSnipMode,
  setReaderHasSnips,
  setReaderZenMode,
  getReaderStateSnapshot,
  subscribeReaderState,
} from '../readerState'

beforeEach(() => {
  // Reset module state
  setReaderSnipMode(false)
  setReaderHasSnips(false)
  setReaderZenMode(false)
})

describe('readerState', () => {
  it('snapshot includes zenMode', () => {
    const snap = getReaderStateSnapshot()
    expect(snap).toHaveProperty('zenMode')
    expect(snap.zenMode).toBe(false)
  })

  it('setReaderZenMode updates snapshot', () => {
    setReaderZenMode(true)
    const snap = getReaderStateSnapshot()
    expect(snap.zenMode).toBe(true)
  })

  it('setReaderZenMode notifies subscribers', () => {
    let notified = false
    const unsub = subscribeReaderState(() => { notified = true })
    setReaderZenMode(true)
    expect(notified).toBe(true)
    unsub()
  })

  it('snapshot is reference-stable when values unchanged', () => {
    const snap1 = getReaderStateSnapshot()
    const snap2 = getReaderStateSnapshot()
    expect(snap1).toBe(snap2)
  })

  it('snapshot updates on any field change', () => {
    const snap1 = getReaderStateSnapshot()
    setReaderZenMode(true)
    const snap2 = getReaderStateSnapshot()
    expect(snap1).not.toBe(snap2)
    expect(snap2.zenMode).toBe(true)
    expect(snap2.snipMode).toBe(false)
  })
})
