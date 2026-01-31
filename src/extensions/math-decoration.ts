import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import type { EditorState } from '@codemirror/state'
import { StateField } from '@codemirror/state'
import katex from 'katex'

const renderCache = new Map<string, string>()

function renderLatex(latex: string, displayMode: boolean): string {
  const key = `${displayMode ? 'B' : 'I'}:${latex}`
  const cached = renderCache.get(key)
  if (cached !== undefined) return cached
  try {
    const html = katex.renderToString(latex, { displayMode, throwOnError: false })
    renderCache.set(key, html)
    return html
  } catch {
    const fallback = displayMode ? `$$${latex}$$` : `$${latex}$`
    renderCache.set(key, fallback)
    return fallback
  }
}

class InlineMathWidget extends WidgetType {
  latex: string

  constructor(latex: string) {
    super()
    this.latex = latex
  }

  eq(other: InlineMathWidget) {
    return this.latex === other.latex
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-math-inline'
    span.innerHTML = renderLatex(this.latex, false)
    return span
  }

  ignoreEvent() {
    return false
  }
}

class BlockMathWidget extends WidgetType {
  latex: string

  constructor(latex: string) {
    super()
    this.latex = latex
  }

  eq(other: BlockMathWidget) {
    return this.latex === other.latex
  }

  toDOM() {
    const div = document.createElement('div')
    div.className = 'cm-math-block'
    div.innerHTML = renderLatex(this.latex, true)
    return div
  }

  ignoreEvent() {
    return false
  }
}

interface MathRegion {
  from: number
  to: number
  latex: string
  displayMode: boolean
}

function findMathRegions(doc: { toString(): string }): MathRegion[] {
  const text = doc.toString()
  const regions: MathRegion[] = []

  // Block math: $$...$$ (delimiters on own lines, or on a single line)
  const blockRe = /\$\$\s*\n([\s\S]*?)\n\s*\$\$|\$\$([^$\n]+)\$\$/g
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(text)) !== null) {
    const content = m[1] ?? m[2]
    regions.push({
      from: m.index,
      to: m.index + m[0].length,
      latex: content.trim(),
      displayMode: true,
    })
  }

  // Inline math: $...$  (not preceded/followed by $)
  const inlineRe = /(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g
  while ((m = inlineRe.exec(text)) !== null) {
    const pos = m.index
    const inBlock = regions.some((r) => pos >= r.from && pos < r.to)
    if (inBlock) continue
    regions.push({
      from: m.index,
      to: m.index + m[0].length,
      latex: m[1],
      displayMode: false,
    })
  }

  return regions
}

function buildDecorations(state: EditorState): DecorationSet {
  const regions = findMathRegions(state.doc)
  const { from: selFrom, to: selTo } = state.selection.main

  const ranges: { from: number; to: number; value: Decoration }[] = []

  for (const region of regions) {
    if (!region.latex) continue
    // If cursor is inside math region, show raw source only
    const cursorInside = selFrom >= region.from && selTo <= region.to

    if (region.displayMode) {
      // Block math: dim source lines, show rendered widget below.
      // No Decoration.replace — line count never changes.
      if (!cursorInside) {
        // Dim source when not editing
        ranges.push({
          from: region.from,
          to: region.to,
          value: Decoration.mark({ class: 'cm-math-source' }),
        })
        // Rendered widget after the block
        ranges.push({
          from: region.to,
          to: region.to,
          value: Decoration.widget({
            widget: new BlockMathWidget(region.latex),
            block: true,
            side: 1,
          }),
        })
      }
    } else {
      // Inline math: replace is safe (single line)
      if (!cursorInside) {
        ranges.push({
          from: region.from,
          to: region.to,
          value: Decoration.replace({
            widget: new InlineMathWidget(region.latex),
          }),
        })
      }
    }
  }

  ranges.sort((a, b) => {
    if (a.from !== b.from) return a.from - b.from
    // Point decorations (widget) after range decorations (mark/replace) at same pos
    const aIsPoint = a.from === a.to ? 1 : 0
    const bIsPoint = b.from === b.to ? 1 : 0
    return aIsPoint - bIsPoint
  })
  return Decoration.set(ranges.map((r) => r.value.range(r.from, r.to)))
}

export const mathDecoration = [
  StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state)
    },
    update(deco, tr) {
      if (tr.docChanged || tr.selection) {
        return buildDecorations(tr.state)
      }
      return deco
    },
    provide: (f) => EditorView.decorations.from(f),
  }),
  EditorView.baseTheme({
    '.cm-math-source': {
      opacity: '0.4',
      fontSize: '0.85em',
    },
  }),
]
