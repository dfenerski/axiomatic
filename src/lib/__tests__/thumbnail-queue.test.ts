import { describe, it, expect, beforeEach } from 'vitest'

// Re-import fresh module for each test to reset module-level state
let acquireSlot: typeof import('../thumbnail-queue').acquireSlot
let setMaxConcurrent: typeof import('../thumbnail-queue').setMaxConcurrent

beforeEach(async () => {
  // Dynamic import with cache-busting isn't possible in vitest easily,
  // so we rely on the module resetting via release calls.
  // Import once and ensure all slots are released between tests.
  const mod = await import('../thumbnail-queue')
  acquireSlot = mod.acquireSlot
  setMaxConcurrent = mod.setMaxConcurrent
  // Reset to default for each test
  setMaxConcurrent(3)
})

describe('thumbnail-queue', () => {
  it('grants slots immediately when under MAX_CONCURRENT (3)', async () => {
    const release1 = await acquireSlot()
    const release2 = await acquireSlot()
    const release3 = await acquireSlot()
    // All three granted immediately (promise resolved)
    expect(typeof release1).toBe('function')
    expect(typeof release2).toBe('function')
    expect(typeof release3).toBe('function')
    release1()
    release2()
    release3()
  })

  it('queues the 4th request until a slot is released', async () => {
    const release1 = await acquireSlot()
    const release2 = await acquireSlot()
    const release3 = await acquireSlot()

    let fourthGranted = false
    const fourthPromise = acquireSlot().then((release) => {
      fourthGranted = true
      return release
    })

    // 4th should be queued
    await Promise.resolve() // flush microtasks
    expect(fourthGranted).toBe(false)

    // Release one slot
    release1()
    const release4 = await fourthPromise
    expect(fourthGranted).toBe(true)

    release2()
    release3()
    release4()
  })

  it('double-release is idempotent', async () => {
    const release1 = await acquireSlot()
    const release2 = await acquireSlot()
    const release3 = await acquireSlot()

    // Double-release slot 1
    release1()
    release1() // should be no-op

    // Should be able to acquire exactly one more slot (not two)
    const release4 = await acquireSlot()

    let fifthGranted = false
    const fifthPromise = acquireSlot().then((r) => {
      fifthGranted = true
      return r
    })
    await Promise.resolve()
    expect(fifthGranted).toBe(false)

    release2()
    const release5 = await fifthPromise
    release3()
    release4()
    release5()
  })

  it('processes queue in FIFO order', async () => {
    const r1 = await acquireSlot()
    const r2 = await acquireSlot()
    const r3 = await acquireSlot()

    const order: number[] = []
    const p4 = acquireSlot().then((r) => { order.push(4); return r })
    const p5 = acquireSlot().then((r) => { order.push(5); return r })

    r1() // releases slot → 4th should be granted
    const r4 = await p4

    r2() // releases slot → 5th should be granted
    const r5 = await p5

    expect(order).toEqual([4, 5])
    r3()
    r4()
    r5()
  })

  it('setMaxConcurrent(2) limits to 2 concurrent slots', async () => {
    setMaxConcurrent(2)

    const r1 = await acquireSlot()
    const r2 = await acquireSlot()

    let thirdGranted = false
    const thirdPromise = acquireSlot().then((r) => {
      thirdGranted = true
      return r
    })

    await Promise.resolve()
    expect(thirdGranted).toBe(false)

    r1()
    const r3 = await thirdPromise
    expect(thirdGranted).toBe(true)

    r2()
    r3()
  })

  it('release triggers next queued item', async () => {
    const releases: (() => void)[] = []
    for (let i = 0; i < 3; i++) {
      releases.push(await acquireSlot())
    }

    let granted = false
    const pending = acquireSlot().then((r) => {
      granted = true
      return r
    })

    await Promise.resolve()
    expect(granted).toBe(false)

    releases[0]()
    const r = await pending
    expect(granted).toBe(true)

    releases[1]()
    releases[2]()
    r()
  })
})
