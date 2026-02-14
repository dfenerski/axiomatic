import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { EditorView } from '@codemirror/view'

export type ActivePane = 'pdf' | 'notes'

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]

interface Options {
  pdfContainerRef: RefObject<HTMLDivElement | null>
  notesOpen: boolean
  setNotesOpen: (open: boolean) => void
  editorRef: RefObject<EditorView | null>
  zoom: number
  onZoomChange: (zoom: number) => void
  onBack: () => void
}

function isInNotesEditor(): boolean {
  const el = document.activeElement
  if (!el) return false
  return !!el.closest('.cm-editor')
}

export function useVimReader({
  pdfContainerRef,
  notesOpen,
  setNotesOpen,
  editorRef,
  zoom,
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
        const idx = ZOOM_STEPS.indexOf(zoom)
        if (idx >= 0 && idx < ZOOM_STEPS.length - 1) {
          onZoomChange(ZOOM_STEPS[idx + 1])
        }
        return
      }
      if (e.ctrlKey && e.key === '-') {
        e.preventDefault()
        const idx = ZOOM_STEPS.indexOf(zoom)
        if (idx > 0) {
          onZoomChange(ZOOM_STEPS[idx - 1])
        }
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
  }, [pdfContainerRef, notesOpen, setNotesOpen, editorRef, zoom, onZoomChange, onBack])

  return { activePane }
}
