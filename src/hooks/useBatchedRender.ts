import { useEffect, useRef, useState } from 'react'

const BATCH_SIZE = 20

export function useBatchedRender(total: number): number {
  const [count, setCount] = useState(() => Math.min(BATCH_SIZE, total))
  const prevTotal = useRef(total)

  // Reset when the total changes (new data loaded, filter applied)
  if (total !== prevTotal.current) {
    prevTotal.current = total
    // Don't call setCount during render — the effect below will catch up.
    // But if total shrank below count, clamp immediately via the return.
  }

  useEffect(() => {
    // Seed first batch when total first becomes non-zero
    setCount((c) => {
      const target = Math.min(BATCH_SIZE, total)
      return c === 0 && total > 0 ? target : c
    })
  }, [total])

  useEffect(() => {
    if (count >= total) return
    const id = requestAnimationFrame(() => {
      setCount((c) => Math.min(c + BATCH_SIZE, total))
    })
    return () => cancelAnimationFrame(id)
  }, [count, total])

  return Math.min(count, total)
}
