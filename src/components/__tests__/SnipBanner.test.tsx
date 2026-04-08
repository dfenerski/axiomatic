import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SnipBanner } from '../SnipBanner'

describe('SnipBanner', () => {
  it('renders label input with placeholder and Save/Cancel buttons', () => {
    render(<SnipBanner onSave={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByPlaceholderText('e.g. Chain rule formula')).toBeInTheDocument()
    expect(screen.getByText('Save')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('Enter submits the trimmed label via onSave', () => {
    const onSave = vi.fn()
    render(<SnipBanner onSave={onSave} onCancel={vi.fn()} />)

    const input = screen.getByPlaceholderText('e.g. Chain rule formula')
    fireEvent.change(input, { target: { value: '  Chain rule  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSave).toHaveBeenCalledWith('Chain rule')
  })

  it('Enter does not submit when input is empty or whitespace', () => {
    const onSave = vi.fn()
    render(<SnipBanner onSave={onSave} onCancel={vi.fn()} />)

    const input = screen.getByPlaceholderText('e.g. Chain rule formula')
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSave).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSave).not.toHaveBeenCalled()
  })

  it('Escape calls onCancel', () => {
    const onCancel = vi.fn()
    render(<SnipBanner onSave={vi.fn()} onCancel={onCancel} />)

    const input = screen.getByPlaceholderText('e.g. Chain rule formula')
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Save button is disabled when input is empty', () => {
    render(<SnipBanner onSave={vi.fn()} onCancel={vi.fn()} />)

    const saveBtn = screen.getByText('Save')
    expect(saveBtn).toBeDisabled()
  })

  it('clicking Save button submits the label', () => {
    const onSave = vi.fn()
    render(<SnipBanner onSave={onSave} onCancel={vi.fn()} />)

    const input = screen.getByPlaceholderText('e.g. Chain rule formula')
    fireEvent.change(input, { target: { value: 'Theorem 3.1' } })
    fireEvent.click(screen.getByText('Save'))

    expect(onSave).toHaveBeenCalledWith('Theorem 3.1')
  })
})
