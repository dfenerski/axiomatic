import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
} from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { getNoteImage, saveNoteImage } from '../lib/notes'

const blobCache = new Map<string, string>()

class ImageWidget extends WidgetType {
  id: string

  constructor(id: string) {
    super()
    this.id = id
  }

  eq(other: ImageWidget) {
    return this.id === other.id
  }

  toDOM() {
    const wrap = document.createElement('span')
    wrap.className = 'cm-image-widget'

    const img = document.createElement('img')
    img.style.maxWidth = '100%'
    img.style.display = 'block'
    img.style.margin = '4px 0'
    img.alt = 'pasted image'

    const cached = blobCache.get(this.id)
    if (cached) {
      img.src = cached
    } else {
      img.style.height = '48px'
      img.style.background = '#e5e7eb'
      const numId = parseInt(this.id, 10)
      if (!isNaN(numId)) {
        getNoteImage(numId).then((data) => {
          const blob = new Blob([data])
          const url = URL.createObjectURL(blob)
          blobCache.set(this.id, url)
          img.src = url
          img.style.height = ''
          img.style.background = ''
        })
      }
    }

    wrap.appendChild(img)
    return wrap
  }

  ignoreEvent() {
    return false
  }
}

const IMAGE_RE = /!\[([^\]]*)\]\(axiomatic-image:\/\/(\d+)\)/g

function buildImageDecorations(view: EditorView): DecorationSet {
  const decorations: { from: number; to: number; deco: Decoration }[] = []
  const { from: selFrom, to: selTo } = view.state.selection.main
  const text = view.state.doc.toString()

  let m: RegExpExecArray | null
  IMAGE_RE.lastIndex = 0
  while ((m = IMAGE_RE.exec(text)) !== null) {
    const from = m.index
    const to = from + m[0].length
    // Show raw when cursor is inside
    if (selFrom >= from && selTo <= to) continue
    decorations.push({
      from,
      to,
      deco: Decoration.replace({
        widget: new ImageWidget(m[2]),
      }),
    })
  }

  decorations.sort((a, b) => a.from - b.from)
  return Decoration.set(decorations.map((d) => d.deco.range(d.from, d.to)))
}

export const imageDecoration = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildImageDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet) {
        this.decorations = buildImageDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)

export function imagePasteHandler(getContext: () => { slug: string; page: number }) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const items = event.clipboardData?.files
      if (!items || items.length === 0) return false

      for (let i = 0; i < items.length; i++) {
        const file = items[i]
        if (!file.type.startsWith('image/')) continue

        event.preventDefault()
        const { slug, page } = getContext()
        const filename = `paste-${Date.now()}-${i}.${file.type.split('/')[1] || 'png'}`

        file.arrayBuffer().then((buf) => {
          const data = Array.from(new Uint8Array(buf))
          saveNoteImage(slug, page, filename, data).then((id) => {
            const insert = `![pasted image](axiomatic-image://${id})`
            const { from } = view.state.selection.main
            view.dispatch({
              changes: { from, insert },
              selection: { anchor: from + insert.length },
            })
          })
        })

        return true
      }
      return false
    },
  })
}
