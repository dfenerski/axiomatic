import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { Editor } from '@tiptap/core'

export type ActivePane = 'pdf' | 'notes'

interface Options {
  pdfContainerRef: RefObject<HTMLDivElement | null>
  notesOpen: boolean
  setNotesOpen: (open: boolean) => void
  editorRef: RefObject<Editor | null>
}

function isInNotesEditor(): boolean {
  const el = document.activeElement
  if (!el) return false
  return !!el.closest('.ProseMirror')
}

export function useVimReader({
  pdfContainerRef,
  notesOpen,
  setNotesOpen,
  editorRef,
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
        case 'j': {
          e.preventDefault()
          pdfContainerRef.current?.scrollBy({
            top: window.innerHeight * 0.6,
            behavior: 'smooth',
          })
          break
        }
        case 'k': {
          e.preventDefault()
          pdfContainerRef.current?.scrollBy({
            top: -window.innerHeight * 0.6,
            behavior: 'smooth',
          })
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
              editorRef.current?.commands.focus()
            }, 50)
          }
          break
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pdfContainerRef, notesOpen, setNotesOpen, editorRef])

  return { activePane }
}
