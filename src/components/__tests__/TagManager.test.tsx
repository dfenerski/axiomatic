import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { TagManager } from '../TagManager'

beforeEach(() => {
  vi.restoreAllMocks()
})

function renderManager(onClose = vi.fn()) {
  const anchor = document.createElement('button')
  anchor.getBoundingClientRect = () => ({ left: 100, top: 50, bottom: 70, right: 200, width: 100, height: 20, x: 100, y: 50, toJSON: () => '' })
  document.body.appendChild(anchor)
  const ref = { current: anchor }
  const result = render(
    <TagManager
      tags={[]}
      anchorRef={ref}
      onCreate={vi.fn()}
      onDelete={vi.fn()}
      onUpdateColor={vi.fn()}
      onClose={onClose}
    />,
  )
  return { onClose, ...result }
}

describe('TagManager', () => {
  it('Escape in "New tag" input closes the manager', () => {
    const { onClose } = renderManager()
    const input = screen.getByPlaceholderText('New tag…')
    input.focus()
    fireEvent.keyDown(input, { key: 'Escape', bubbles: true })
    expect(onClose).toHaveBeenCalled()
  })
})
