import { useEffect, useRef, useState } from 'react'
import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, gutter, GutterMarker } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { vim, getCM } from '@replit/codemirror-vim'
import { mathDecoration } from '../extensions/math-decoration'
import { imageDecoration, imagePasteHandler } from '../extensions/image-paste'
import { editorTheme } from '../extensions/editor-theme'
import { useTheme } from '../hooks/useTheme'
import 'katex/dist/katex.min.css'

class RelNumberMarker extends GutterMarker {
  text: string
  constructor(text: string) { super(); this.text = text }
  eq(other: GutterMarker) { return (other as RelNumberMarker).text === this.text }
  toDOM() {
    const span = document.createElement('span')
    span.textContent = this.text
    return span
  }
}

const relativeLineNumbers = gutter({
  class: 'cm-lineNumbers',
  lineMarker(view, line) {
    const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number
    const lineNo = view.state.doc.lineAt(line.from).number
    const display = lineNo === cursorLine ? String(lineNo) : String(Math.abs(lineNo - cursorLine))
    return new RelNumberMarker(display)
  },
  lineMarkerChange(update) {
    return update.selectionSet || update.docChanged
  },
  initialSpacer(view) {
    return new RelNumberMarker(String(view.state.doc.lines))
  },
  updateSpacer(_spacer, update) {
    return new RelNumberMarker(String(update.view.state.doc.lines))
  },
})

interface Props {
  slug: string
  page: number
  content: string
  onUpdate: (slug: string, page: number, content: string) => void
  externalEditorRef?: React.RefObject<EditorView | null>
  width?: number
}

export function NotesPanel({ slug, page, content, onUpdate, externalEditorRef, width }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const currentKeyRef = useRef(`${slug}:${page}`)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const contextRef = useRef({ slug, page })
  const onUpdateRef = useRef(onUpdate)
  const themeCompartmentRef = useRef(new Compartment())
  const [vimMode, setVimMode] = useState('normal')
  const { resolved } = useTheme()
  const isDark = resolved === 'dark'

  // Keep refs in sync via effects (not during render)
  useEffect(() => {
    contextRef.current = { slug, page }
  }, [slug, page])

  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  useEffect(() => {
    if (!containerRef.current) return

    const themeCompartment = themeCompartmentRef.current

    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return
      const doc = update.state.doc.toString()
      const ctx = contextRef.current
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onUpdateRef.current(ctx.slug, ctx.page, doc)
      }, 150)
    })

    const vimModeListener = EditorView.updateListener.of((update) => {
      if (!update.view) return
      const cmVim = getCM(update.view)
      if (cmVim) {
        const mode = cmVim.state.vim?.mode ?? 'normal'
        setVimMode(mode)
      }
    })

    const state = EditorState.create({
      doc: content,
      extensions: [
        vim(),
        relativeLineNumbers,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ codeLanguages: languages }),
        mathDecoration,
        imageDecoration,
        imagePasteHandler(() => contextRef.current),
        updateListener,
        vimModeListener,
        themeCompartment.of(editorTheme(isDark)),
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view
    if (externalEditorRef) {
      ;(externalEditorRef as React.MutableRefObject<EditorView | null>).current = view
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reconfigure editor theme when dark mode changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(editorTheme(isDark)),
    })
  }, [isDark])

  // Update content when slug/page changes
  useEffect(() => {
    const newKey = `${slug}:${page}`
    if (newKey !== currentKeyRef.current) {
      currentKeyRef.current = newKey
      const view = viewRef.current
      if (view) {
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: content,
          },
        })
      }
    }
  }, [slug, page, content])

  const modeDisplay = vimMode.toUpperCase().replace(' ', ' -- ')

  return (
    <div className="flex h-full min-h-0 shrink-0 flex-col border-l border-[#eee8d5] bg-[#fdf6e3] dark:border-[#073642] dark:bg-[#002b36]" style={width ? { width } : { width: 384 }}>
      <div className="flex h-12 shrink-0 items-center border-b border-[#eee8d5] px-4 dark:border-[#073642]">
        <span className="text-sm font-medium text-[#586e75] dark:text-[#93a1a1]">
          Notes &mdash; Page {page}
        </span>
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden" />
      <div className="flex h-7 shrink-0 items-center border-t border-[#eee8d5] bg-[#eee8d5] px-3 dark:border-[#073642] dark:bg-[#073642]">
        <span className="text-xs font-semibold tracking-wide text-[#93a1a1] dark:text-[#657b83]">
          -- {modeDisplay} --
        </span>
      </div>
    </div>
  )
}
