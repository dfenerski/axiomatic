import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { EditorView } from '@codemirror/view'

export type ActivePane = 'pdf' | 'notes'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 5
const ZOOM_FACTOR = 1.1

function clampZoom(z: number): number {
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) * 100) / 100
}

interface Options {
  pdfContainerRef: RefObject<HTMLDivElement | null>
  notesOpen: boolean
  setNotesOpen: (open: boolean) => void
  editorRef: RefObject<EditorView | null>
  zoomRef: RefObject<number>
  onZoomChange: (zoom: number) => void
  onBack: () => void
}

function isInNotesEditor(): boolean {
  const el = document.activeElement
  if (!el) return false
  return !!el.closest('.cm-editor')
}

function isInTextField(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || !!el.closest('.cm-editor')
}

export function useVimReader({
  pdfContainerRef,
  notesOpen,
  setNotesOpen,
  editorRef,
  zoomRef,
  onZoomChange,
  onBack,
}: Options) {
  const [activePane, setActivePane] = useState<ActivePane>('pdf')

  // Track focus changes to keep activePane in sync
  useEffect(() => {
    const onFocus = () => {
      setActivePane(isInNotesEditor() ? 'notes' : 'pdf')
    }
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onFocus)
    return () => {
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onFocus)
    }
  }, [])

  // Reset to pdf when notes close
  useEffect(() => {
    if (!notesOpen) setActivePane('pdf')
  }, [notesOpen])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Zoom in/out regardless of active pane
      if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        onZoomChange(clampZoom(zoomRef.current * ZOOM_FACTOR))
        return
      }
      if (e.ctrlKey && e.key === '-') {
        e.preventDefault()
        onZoomChange(clampZoom(zoomRef.current / ZOOM_FACTOR))
        return
      }

      if (isInNotesEditor()) {
        // Notes mode: only intercept Ctrl+h
        if (e.key === 'h' && e.ctrlKey) {
          e.preventDefault()
          ;(document.activeElement as HTMLElement)?.blur()
          setActivePane('pdf')
        }
        return
      }

      // Skip all navigation keys when focus is in any text field
      // (search bar, command palette, etc.)
      if (isInTextField()) return

      // PDF mode
      switch (e.key) {
        case 'ArrowDown':
        case 'j': {
          e.preventDefault()
          pdfContainerRef.current?.scrollBy({
            top: window.innerHeight * 0.6,
            behavior: 'smooth',
          })
          break
        }
        case 'ArrowUp':
        case 'k': {
          e.preventDefault()
          pdfContainerRef.current?.scrollBy({
            top: -window.innerHeight * 0.6,
            behavior: 'smooth',
          })
          break
        }
        case ' ': {
          e.preventDefault()
          pdfContainerRef.current?.scrollBy({
            top: window.innerHeight,
            behavior: 'smooth',
          })
          break
        }
        case 'h': {
          if (e.ctrlKey) {
            e.preventDefault()
            onBack()
          }
          break
        }
        case 'l': {
          if (e.ctrlKey) {
            e.preventDefault()
            if (!notesOpen) {
              setNotesOpen(true)
            }
            setActivePane('notes')
            // Focus editor after a tick to allow panel to mount
            setTimeout(() => {
              editorRef.current?.focus()
            }, 50)
          }
          break
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pdfContainerRef, notesOpen, setNotesOpen, editorRef, onZoomChange, onBack])

  // Ctrl+wheel zoom — listen on window (capture) so we intercept before
  // the WebView's built-in page zoom handler can consume the event
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const direction = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR
      onZoomChange(clampZoom(zoomRef.current * direction))
    }
    window.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => window.removeEventListener('wheel', onWheel, { capture: true })
  }, [onZoomChange])

  return { activePane }
}
