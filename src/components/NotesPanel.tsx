import { useEffect, useRef, useState } from 'react'
import { Extension, InputRule, type Editor } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { Node } from '@tiptap/pm/model'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { InlineMath, BlockMath } from '@tiptap/extension-mathematics'
import { VimMode, type VimModeType } from '../extensions/vim-mode'
import 'katex/dist/katex.min.css'

function unpackInlineMath(editor: Editor | null, pos: number, latex: string) {
  if (!editor) return
  const node = editor.state.doc.nodeAt(pos)
  if (!node) return
  const raw = `$${latex}$`
  const { tr } = editor.state
  tr.replaceWith(pos, pos + node.nodeSize, editor.schema.text(raw))
  tr.setSelection(TextSelection.create(tr.doc, pos + 1 + latex.length))
  editor.view.dispatch(tr)
  editor.view.focus()
}

function unpackBlockMath(editor: Editor | null, pos: number, latex: string) {
  if (!editor) return
  const node = editor.state.doc.nodeAt(pos)
  if (!node) return
  const { tr, schema } = editor.state
  const pType = schema.nodes.paragraph
  const lines = latex.split('\n')
  const nodes = [
    pType.create(null, schema.text('$$')),
    ...lines.map((l) => (l ? pType.create(null, schema.text(l)) : pType.create())),
    pType.create(null, schema.text('$$')),
  ]
  tr.replaceWith(pos, pos + node.nodeSize, nodes)
  tr.setSelection(TextSelection.create(tr.doc, pos + nodes[0].nodeSize + 1))
  editor.view.dispatch(tr)
  editor.view.focus()
}

const CustomInlineMath = InlineMath.extend({
  addInputRules() {
    return [
      new InputRule({
        find: /(?:^|[^$])(\$([^$\n]+?)\$)$/,
        handler: ({ state, range, match }) => {
          const latex = match[2]
          const { tr } = state
          const start = range.from + match[0].indexOf(match[1])
          tr.replaceWith(start, range.to, this.type.create({ latex }))
        },
      }),
    ]
  },
})

const CustomBlockMath = BlockMath.extend({
  addInputRules() {
    return []
  },
})

const blockMathCollapseKey = new PluginKey('blockMathCollapse')

/**
 * Standalone extension that watches the document for paired $$
 * delimiter paragraphs and collapses them + their content into
 * a single blockMath node.  Uses a view-plugin (update) instead
 * of appendTransaction to avoid recursive dispatch issues.
 */
const BlockMathCollapse = Extension.create({
  name: 'blockMathCollapse',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: blockMathCollapseKey,
        view() {
          return {
            update(view, prevState) {
              if (prevState.doc.eq(view.state.doc)) return

              const { doc, schema } = view.state
              const blockMathType = schema.nodes.blockMath
              if (!blockMathType) return

              let openOffset = -1
              let openIndex = -1

              doc.forEach((child, offset, index) => {
                // Already found a pair in this pass — skip the rest
                if (openOffset === -2) return

                const isDollarPara =
                  child.type.name === 'paragraph' &&
                  child.textContent.trim() === '$$'

                if (!isDollarPara) {
                  // If we haven't found an opener yet, nothing to do
                  // If we have an opener, this is content — keep scanning
                  return
                }

                if (openIndex === -1) {
                  // First $$ — mark as opener
                  openIndex = index
                  openOffset = offset
                  return
                }

                // Second $$ — collect lines between opener and closer
                const lines: string[] = []
                for (let j = openIndex + 1; j < index; j++) {
                  lines.push(doc.child(j).textContent)
                }
                const latex = lines.join('\n').trim()

                if (!latex) {
                  // Empty block — reset and treat this as new opener
                  openIndex = index
                  openOffset = offset
                  return
                }

                const closeEnd = offset + child.nodeSize
                const tr = view.state.tr
                tr.replaceWith(openOffset, closeEnd, blockMathType.create({ latex }))
                view.dispatch(tr)

                // Signal: stop iterating (we dispatched, a new update will fire)
                openOffset = -2
              })
            },
          }
        },
      }),
    ]
  },
})

interface Props {
  slug: string
  page: number
  content: string
  onUpdate: (slug: string, page: number, content: string) => void
  externalEditorRef?: React.RefObject<Editor | null>
}

export function NotesPanel({ slug, page, content, onUpdate, externalEditorRef }: Props) {
  const currentKeyRef = useRef(`${slug}:${page}`)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const editorRef = useRef<Editor | null>(null)
  const [vimMode, setVimMode] = useState<VimModeType>('NORMAL')
  const vimModeRef = useRef<VimModeType>('NORMAL')

  const editor = useEditor({
    extensions: [
      StarterKit,
      CustomInlineMath.configure({
        onClick: (node: Node, pos: number) =>
          unpackInlineMath(editorRef.current, pos, node.attrs.latex),
      }),
      CustomBlockMath.configure({
        onClick: (node: Node, pos: number) =>
          unpackBlockMath(editorRef.current, pos, node.attrs.latex),
      }),
      BlockMathCollapse,
      VimMode,
    ],
    content,
    onTransaction: ({ editor: ed }) => {
      const mode = ed.storage.vimMode?.mode as VimModeType | undefined
      if (mode && mode !== vimModeRef.current) {
        vimModeRef.current = mode
        setVimMode(mode)
      }
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML()
      const key = currentKeyRef.current
      const [s, p] = key.split(':')
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onUpdate(s, Number(p), html)
      }, 150)
    },
  })

  editorRef.current = editor
  if (externalEditorRef) {
    (externalEditorRef as React.MutableRefObject<Editor | null>).current = editor
  }

  useEffect(() => {
    const newKey = `${slug}:${page}`
    if (newKey !== currentKeyRef.current) {
      currentKeyRef.current = newKey
      editor?.commands.setContent(content)
    }
  }, [slug, page, content, editor])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div className="flex w-96 shrink-0 flex-col border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="flex h-12 shrink-0 items-center border-b border-gray-200 px-4 dark:border-gray-700">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Notes &mdash; Page {page}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <EditorContent
          editor={editor}
          className="prose prose-sm max-w-none dark:prose-invert [&_.ProseMirror]:outline-none"
        />
      </div>
      <div className="flex h-7 shrink-0 items-center border-t border-gray-200 bg-gray-50 px-3 dark:border-gray-700 dark:bg-gray-800">
        <span className="text-xs font-semibold tracking-wide text-gray-400 dark:text-gray-500">
          -- {vimMode} --
        </span>
      </div>
    </div>
  )
}
