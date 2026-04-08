import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, it, expect } from 'vitest'
import { TileGrid } from '../TileGrid'

describe('TileGrid', () => {
  it('renders children inside the grid container', () => {
    render(
      <TileGrid>
        <div>Tile A</div>
        <div>Tile B</div>
        <div>Tile C</div>
      </TileGrid>,
    )

    expect(screen.getByText('Tile A')).toBeInTheDocument()
    expect(screen.getByText('Tile B')).toBeInTheDocument()
    expect(screen.getByText('Tile C')).toBeInTheDocument()
  })

  it('attaches gridRef to the container div', () => {
    const gridRef = createRef<HTMLDivElement>()
    render(
      <TileGrid gridRef={gridRef}>
        <div>Child</div>
      </TileGrid>,
    )

    expect(gridRef.current).toBeInstanceOf(HTMLDivElement)
    expect(gridRef.current!.textContent).toContain('Child')
  })

  it('applies grid CSS class to the container', () => {
    const gridRef = createRef<HTMLDivElement>()
    render(
      <TileGrid gridRef={gridRef}>
        <div>Item</div>
      </TileGrid>,
    )

    expect(gridRef.current!.className).toContain('grid')
  })
})
