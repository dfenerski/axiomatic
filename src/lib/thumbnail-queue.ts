let maxConcurrent = 3
let running = 0
const queue: (() => void)[] = []

export function setMaxConcurrent(n: number) {
  maxConcurrent = n
}

function tryNext() {
  while (running < maxConcurrent && queue.length > 0) {
    running++
    queue.shift()!()
  }
}

/** Request a render slot. Returns a promise that resolves with a release function. */
export function acquireSlot(): Promise<() => void> {
  return new Promise<() => void>((resolve) => {
    const grant = () => {
      let released = false
      resolve(() => {
        if (released) return
        released = true
        running--
        tryNext()
      })
    }
    if (running < maxConcurrent) {
      running++
      grant()
    } else {
      queue.push(grant)
    }
  })
}
