let running = 0
const MAX_CONCURRENT = 2
const queue: (() => void)[] = []

let totalEnqueued = 0
let totalCompleted = 0
let pendingNotify = false

export interface QueueProgress {
  completed: number
  total: number
  idle: boolean
}

const progressListeners = new Set<(snapshot: QueueProgress) => void>()

function snapshot(): QueueProgress {
  const idle = running === 0 && queue.length === 0
  return { completed: totalCompleted, total: totalEnqueued, idle }
}

function notify() {
  if (pendingNotify) return
  pendingNotify = true
  queueMicrotask(() => {
    pendingNotify = false
    const s = snapshot()
    if (s.idle) {
      totalEnqueued = 0
      totalCompleted = 0
    }
    for (const fn of progressListeners) fn(s)
  })
}

export function subscribeProgress(
  listener: (snapshot: QueueProgress) => void,
): () => void {
  progressListeners.add(listener)
  listener(snapshot())
  return () => {
    progressListeners.delete(listener)
  }
}

export function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  totalEnqueued++
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      running++
      notify()
      fn()
        .then(resolve, reject)
        .finally(() => {
          running--
          totalCompleted++
          if (queue.length > 0) queue.shift()!()
          notify()
        })
    }
    if (running < MAX_CONCURRENT) run()
    else queue.push(run)
  })
}
