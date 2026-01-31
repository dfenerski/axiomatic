import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

const VIRTUAL_ID = 'virtual:textbooks'
const RESOLVED_ID = '\0' + VIRTUAL_ID

function scanTextbooks(dir: string) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .map((file) => {
      const slug = file.replace(/\.pdf$/i, '')
      const title = slug
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
      return { slug, title, file }
    })
}

export function textbooksPlugin(): Plugin {
  let textbooksDir: string

  return {
    name: 'vite-plugin-textbooks',
    configResolved(config) {
      textbooksDir = path.resolve(config.publicDir, 'textbooks')
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id) {
      if (id === RESOLVED_ID) {
        const books = scanTextbooks(textbooksDir)
        return `export default ${JSON.stringify(books)};`
      }
    },
    configureServer(server) {
      if (!fs.existsSync(textbooksDir)) {
        fs.mkdirSync(textbooksDir, { recursive: true })
      }
      const watcher = server.watcher
      watcher.add(textbooksDir)
      watcher.on('all', (_event, filePath) => {
        if (
          filePath.startsWith(textbooksDir) &&
          filePath.toLowerCase().endsWith('.pdf')
        ) {
          const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
          if (mod) {
            server.moduleGraph.invalidateModule(mod)
            server.ws.send({ type: 'full-reload' })
          }
        }
      })
    },
  }
}
