import type { ReactNode, RefObject } from 'react'

interface Props {
  children: ReactNode
  gridRef?: RefObject<HTMLDivElement | null>
}

export function TileGrid({ children, gridRef }: Props) {
  return (
    <div
      ref={gridRef}
      className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
    >
      {children}
    </div>
  )
}
