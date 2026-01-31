import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, Selection, TextSelection } from '@tiptap/pm/state'
import type { Transaction } from '@tiptap/pm/state'
import { undo, redo } from '@tiptap/pm/history'
import type { EditorView } from '@tiptap/pm/view'

export type VimModeType = 'NORMAL' | 'INSERT' | 'VISUAL'

const vimModeKey = new PluginKey('vimMode')
const MODE_META = 'vimModeChange'

// ── Movement helpers ──────────────────────────────────────────────

function clamp(pos: number, min: number, max: number) {
  return Math.max(min, Math.min(max, pos))
}

function safeSel(view: EditorView, pos: number) {
  const clamped = clamp(pos, 0, view.state.doc.content.size)
  return Selection.near(view.state.doc.resolve(clamped))
}

function moveLeft(view: EditorView) {
  const { $head } = view.state.selection
  return safeSel(view, $head.pos - 1)
}

function moveRight(view: EditorView) {
  const { $head } = view.state.selection
  return safeSel(view, $head.pos + 1)
}

function moveUp(view: EditorView) {
  const { $head } = view.state.selection
  const depth = $head.depth
  if (depth === 0) return view.state.selection
  const blockStart = $head.start(depth)
  const col = $head.pos - blockStart
  const before = $head.before(depth)
  if (before <= 0) return view.state.selection
  const $before = view.state.doc.resolve(before - 1)
  const prevDepth = $before.depth
  if (prevDepth === 0) return safeSel(view, 1)
  const prevStart = $before.start(prevDepth)
  const prevEnd = $before.end(prevDepth)
  const target = Math.min(prevStart + col, prevEnd)
  return safeSel(view, target)
}

function moveDown(view: EditorView) {
  const { $head } = view.state.selection
  const depth = $head.depth
  if (depth === 0) return view.state.selection
  const blockStart = $head.start(depth)
  const col = $head.pos - blockStart
  const after = $head.after(depth)
  if (after >= view.state.doc.content.size) return view.state.selection
  const $after = view.state.doc.resolve(after + 1)
  const nextDepth = $after.depth
  if (nextDepth === 0) return safeSel(view, view.state.doc.content.size - 1)
  const nextStart = $after.start(nextDepth)
  const nextEnd = $after.end(nextDepth)
  const target = Math.min(nextStart + col, nextEnd)
  return safeSel(view, target)
}

function moveWordForward(view: EditorView) {
  const { $head } = view.state.selection
  const pos = $head.pos
  const text = view.state.doc.textBetween(pos, view.state.doc.content.size, '\n')
  const m = text.match(/^\W*\w+/)
  if (m) return safeSel(view, pos + m[0].length)
  return safeSel(view, view.state.doc.content.size - 1)
}

function moveWordBackward(view: EditorView) {
  const { $head } = view.state.selection
  const pos = $head.pos
  const text = view.state.doc.textBetween(0, pos, '\n')
  const m = text.match(/\w+\W*$/)
  if (m) return safeSel(view, pos - m[0].length)
  return safeSel(view, 1)
}

function moveLineStart(view: EditorView) {
  const { $head } = view.state.selection
  const depth = $head.depth
  if (depth === 0) return safeSel(view, 1)
  return safeSel(view, $head.start(depth))
}

function moveLineEnd(view: EditorView) {
  const { $head } = view.state.selection
  const depth = $head.depth
  if (depth === 0) return safeSel(view, view.state.doc.content.size - 1)
  return safeSel(view, $head.end(depth))
}

function moveDocStart(view: EditorView) {
  return safeSel(view, 1)
}

function moveDocEnd(view: EditorView) {
  return safeSel(view, view.state.doc.content.size - 1)
}

// ── Helpers to build a single transaction with optional mode tag ──

function tagMode(tr: Transaction, mode: VimModeType): Transaction {
  return tr.setMeta(MODE_META, mode)
}

// ── Extension ─────────────────────────────────────────────────────

export const VimMode = Extension.create({
  name: 'vimMode',

  addStorage() {
    return {
      mode: 'NORMAL' as VimModeType,
      visualAnchor: 0,
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage as { mode: VimModeType; visualAnchor: number }

    let pendingKey = ''
    let pendingTimeout: ReturnType<typeof setTimeout> | undefined
    let wasBlurred = false
    let yankRegister = ''

    function clearPending() {
      pendingKey = ''
      if (pendingTimeout) {
        clearTimeout(pendingTimeout)
        pendingTimeout = undefined
      }
    }

    function setPending(key: string) {
      pendingKey = key
      if (pendingTimeout) clearTimeout(pendingTimeout)
      pendingTimeout = setTimeout(clearPending, 500)
    }

    /** Set storage only — caller is responsible for dispatching a transaction. */
    function setMode(mode: VimModeType) {
      storage.mode = mode
    }

    /** Dispatch a single no-op transaction that carries the mode change meta. */
    function dispatchModeOnly(view: EditorView, mode: VimModeType) {
      storage.mode = mode
      view.dispatch(tagMode(view.state.tr, mode))
    }

    function dispatch(view: EditorView, tr: Transaction) {
      view.dispatch(tr)
    }

    function movementForKey(key: string, view: EditorView): Selection | null {
      switch (key) {
        case 'h': return moveLeft(view)
        case 'l': return moveRight(view)
        case 'j': return moveDown(view)
        case 'k': return moveUp(view)
        case 'w': return moveWordForward(view)
        case 'b': return moveWordBackward(view)
        default: return null
      }
    }

    return [
      new Plugin({
        key: vimModeKey,
        props: {
          handleKeyDown(view, event) {
            const key = event.key
            const mode = storage.mode

            // ── INSERT mode ──
            if (mode === 'INSERT') {
              if (key === 'Escape') {
                clearPending()
                dispatchModeOnly(view, 'NORMAL')
                return true
              }
              return false
            }

            // ── VISUAL mode ──
            if (mode === 'VISUAL') {
              if (key === 'Escape') {
                clearPending()
                setMode('NORMAL')
                // Collapse selection to head — single dispatch carries mode meta
                const { $head } = view.state.selection
                const tr = view.state.tr.setSelection(Selection.near($head))
                dispatch(view, tagMode(tr, 'NORMAL'))
                return true
              }

              // Movement extends selection
              const moveSel = movementForKey(key, view)
              if (moveSel) {
                const anchor = storage.visualAnchor
                const $anchor = view.state.doc.resolve(clamp(anchor, 0, view.state.doc.content.size))
                const $head = view.state.doc.resolve(clamp(moveSel.$head.pos, 0, view.state.doc.content.size))
                const tr = view.state.tr.setSelection(new TextSelection($anchor, $head))
                dispatch(view, tr)
                return true
              }

              if (key === 'd') {
                const { from, to } = view.state.selection
                setMode('NORMAL')
                if (from !== to) {
                  dispatch(view, tagMode(view.state.tr.delete(from, to), 'NORMAL'))
                } else {
                  dispatchModeOnly(view, 'NORMAL')
                }
                return true
              }

              if (key === 'y') {
                const { from, to } = view.state.selection
                const text = view.state.doc.textBetween(from, to, '\n')
                yankRegister = text
                navigator.clipboard.writeText(text)
                setMode('NORMAL')
                const { $head } = view.state.selection
                dispatch(view, tagMode(view.state.tr.setSelection(Selection.near($head)), 'NORMAL'))
                return true
              }

              return true
            }

            // ── NORMAL mode ──

            // Let Ctrl+h bubble for pane switch
            if (key === 'h' && event.ctrlKey) {
              return false
            }

            // Multi-key: gg
            if (pendingKey === 'g' && key === 'g') {
              clearPending()
              dispatch(view, view.state.tr.setSelection(moveDocStart(view)))
              return true
            }

            // Multi-key: dd
            if (pendingKey === 'd' && key === 'd') {
              clearPending()
              const { $head } = view.state.selection
              const depth = $head.depth
              if (depth > 0) {
                const from = $head.before(depth)
                const to = $head.after(depth)
                dispatch(view, view.state.tr.delete(from, to))
              }
              return true
            }

            // Multi-key: cc — delete line content, enter insert
            if (pendingKey === 'c' && key === 'c') {
              clearPending()
              const { $head } = view.state.selection
              const depth = $head.depth
              setMode('INSERT')
              if (depth > 0) {
                const start = $head.start(depth)
                const end = $head.end(depth)
                if (end > start) {
                  dispatch(view, tagMode(view.state.tr.delete(start, end), 'INSERT'))
                } else {
                  dispatchModeOnly(view, 'INSERT')
                }
              } else {
                dispatchModeOnly(view, 'INSERT')
              }
              return true
            }

            // Multi-key: yy — yank current line to clipboard
            if (pendingKey === 'y' && key === 'y') {
              clearPending()
              const { $head } = view.state.selection
              const depth = $head.depth
              if (depth > 0) {
                const start = $head.start(depth)
                const end = $head.end(depth)
                const text = view.state.doc.textBetween(start, end, '\n')
                yankRegister = text
                navigator.clipboard.writeText(text)
              }
              return true
            }

            // d + motion: delete from cursor to motion target
            if (pendingKey === 'd') {
              const motion = movementForKey(key, view)
              if (motion) {
                clearPending()
                const { $head } = view.state.selection
                const cur = $head.pos
                const target = motion.$head.pos
                if (key === 'j' || key === 'k') {
                  // line-wise: delete whole blocks
                  const curDepth = $head.depth
                  const $target = view.state.doc.resolve(target)
                  const targetDepth = $target.depth
                  const from = Math.min(
                    curDepth > 0 ? $head.before(curDepth) : cur,
                    targetDepth > 0 ? $target.before(targetDepth) : target,
                  )
                  const to = Math.max(
                    curDepth > 0 ? $head.after(curDepth) : cur,
                    targetDepth > 0 ? $target.after(targetDepth) : target,
                  )
                  if (from < to) dispatch(view, view.state.tr.delete(from, to))
                } else {
                  // char/word-wise
                  const from = Math.min(cur, target)
                  const to = Math.max(cur, target)
                  if (from < to) dispatch(view, view.state.tr.delete(from, to))
                }
                return true
              }
              // Not a movement key — clear pending and fall through
              clearPending()
            }

            // Start multi-key sequences
            if (key === 'g') { setPending('g'); return true }
            if (key === 'd') { setPending('d'); return true }
            if (key === 'c') { setPending('c'); return true }
            if (key === 'y') { setPending('y'); return true }

            clearPending()

            // Movement
            const moveSel = movementForKey(key, view)
            if (moveSel) {
              dispatch(view, view.state.tr.setSelection(moveSel))
              return true
            }

            // Line start/end
            if (key === '0') {
              dispatch(view, view.state.tr.setSelection(moveLineStart(view)))
              return true
            }
            if (key === '$') {
              dispatch(view, view.state.tr.setSelection(moveLineEnd(view)))
              return true
            }

            // Doc end
            if (key === 'G') {
              dispatch(view, view.state.tr.setSelection(moveDocEnd(view)))
              return true
            }

            // Delete char at cursor
            if (key === 'x') {
              const { $head } = view.state.selection
              const pos = $head.pos
              const end = Math.min(pos + 1, view.state.doc.content.size)
              if (pos < end) {
                dispatch(view, view.state.tr.delete(pos, end))
              }
              return true
            }

            // Paste from yank register
            if (key === 'p') {
              if (yankRegister) {
                const { $head } = view.state.selection
                const pos = Math.min($head.pos + 1, view.state.doc.content.size)
                const tr = view.state.tr
                const sel = Selection.near(tr.doc.resolve(pos))
                tr.setSelection(sel)
                tr.insertText(yankRegister)
                dispatch(view, tr)
              }
              return true
            }

            // Undo / Redo
            if (key === 'u') {
              undo(view.state, view.dispatch)
              return true
            }
            if (key === 'r' && event.ctrlKey) {
              redo(view.state, view.dispatch)
              return true
            }

            // Mode transitions
            if (key === 'i') {
              dispatchModeOnly(view, 'INSERT')
              return true
            }
            if (key === 'a') {
              setMode('INSERT')
              const { $head } = view.state.selection
              const newPos = Math.min($head.pos + 1, view.state.doc.content.size)
              const sel = safeSel(view, newPos)
              dispatch(view, tagMode(view.state.tr.setSelection(sel), 'INSERT'))
              return true
            }
            if (key === 'o') {
              setMode('INSERT')
              const { $head } = view.state.selection
              const depth = $head.depth
              const after = depth > 0 ? $head.after(depth) : $head.pos
              const pType = view.state.schema.nodes.paragraph
              const tr = view.state.tr.insert(after, pType.create())
              const newPos = after + 1
              tr.setSelection(Selection.near(tr.doc.resolve(newPos)))
              dispatch(view, tagMode(tr, 'INSERT'))
              return true
            }
            if (key === 'O') {
              setMode('INSERT')
              const { $head } = view.state.selection
              const depth = $head.depth
              const before = depth > 0 ? $head.before(depth) : $head.pos
              const pType = view.state.schema.nodes.paragraph
              const tr = view.state.tr.insert(before, pType.create())
              const newPos = before + 1
              tr.setSelection(Selection.near(tr.doc.resolve(newPos)))
              dispatch(view, tagMode(tr, 'INSERT'))
              return true
            }
            if (key === 'v') {
              storage.visualAnchor = view.state.selection.$head.pos
              dispatchModeOnly(view, 'VISUAL')
              return true
            }
            if (key === 'V') {
              const { $head } = view.state.selection
              const depth = $head.depth
              if (depth > 0) {
                const start = $head.start(depth)
                const end = $head.end(depth)
                storage.visualAnchor = start
                setMode('VISUAL')
                const $anchor = view.state.doc.resolve(start)
                const $end = view.state.doc.resolve(end)
                dispatch(view, tagMode(
                  view.state.tr.setSelection(new TextSelection($anchor, $end)),
                  'VISUAL',
                ))
              }
              return true
            }

            // Swallow everything else in normal mode
            return true
          },

          handleDOMEvents: {
            blur() {
              wasBlurred = true
              return false
            },
            focus(view) {
              if (wasBlurred) {
                wasBlurred = false
                if (storage.mode !== 'NORMAL') {
                  dispatchModeOnly(view, 'NORMAL')
                }
                clearPending()
              }
              return false
            },
          },
        },
      }),
    ]
  },
})
