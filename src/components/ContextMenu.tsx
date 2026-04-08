import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface MenuItem {
  label: string
  action: () => void
}

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [focusIndex, setFocusIndex] = useState(-1)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          onClose()
          break
        case 'ArrowDown':
        case 'j':
          e.preventDefault()
          setFocusIndex((prev) => (prev + 1) % items.length)
          break
        case 'ArrowUp':
        case 'k':
          e.preventDefault()
          setFocusIndex((prev) => (prev - 1 + items.length) % items.length)
          break
        case 'Enter':
          e.preventDefault()
          if (focusIndex >= 0 && focusIndex < items.length) {
            items[focusIndex].action()
            onClose()
          }
          break
      }
    }
    const handleScroll = () => onClose()

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose, items, focusIndex])

  // Auto-focus the menu container for keyboard nav
  useEffect(() => {
    ref.current?.focus()
  }, [])

  // Scroll focused item into view
  useEffect(() => {
    if (focusIndex >= 0 && ref.current) {
      const buttons = ref.current.querySelectorAll('[role="menuitem"]')
      buttons[focusIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [focusIndex])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      className="fixed z-50 min-w-[140px] rounded-md border border-[#eee8d5] bg-[#fdf6e3] py-1 shadow-lg outline-none dark:border-[#073642] dark:bg-[#073642]"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <button
          key={item.label}
          role="menuitem"
          onClick={(e) => {
            e.stopPropagation()
            item.action()
            onClose()
          }}
          className={`block w-full px-3 py-1.5 text-left text-sm text-[#586e75] dark:text-[#93a1a1] ${
            i === focusIndex
              ? 'bg-[#eee8d5] dark:bg-[#002b36]'
              : 'hover:bg-[#eee8d5] dark:hover:bg-[#073642]'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}
