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

      server.middlewares.use('/__textbooks/rename', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }
        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString() })
        req.on('end', () => {
          try {
            const { file, newName } = JSON.parse(body)
            if (!file || !newName || typeof file !== 'string' || typeof newName !== 'string') {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Missing file or newName' }))
              return
            }
            if (file.includes('/') || file.includes('..') || newName.includes('/') || newName.includes('..')) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid file name' }))
              return
            }
            const oldPath = path.join(textbooksDir, file)
            const newFile = newName.endsWith('.pdf') ? newName : newName + '.pdf'
            const newPath = path.join(textbooksDir, newFile)
            if (!fs.existsSync(oldPath)) {
              res.statusCode = 404
              res.end(JSON.stringify({ error: 'File not found' }))
              return
            }
            fs.renameSync(oldPath, newPath)
            const slug = newFile.replace(/\.pdf$/i, '')
            const title = slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ slug, title, file: newFile }))
          } catch {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Invalid JSON' }))
          }
        })
      })

      server.middlewares.use('/__textbooks/delete', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }
        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString() })
        req.on('end', () => {
          try {
            const { file } = JSON.parse(body)
            if (!file || typeof file !== 'string') {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Missing file' }))
              return
            }
            if (file.includes('/') || file.includes('..')) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid file name' }))
              return
            }
            const filePath = path.join(textbooksDir, file)
            if (!fs.existsSync(filePath)) {
              res.statusCode = 404
              res.end(JSON.stringify({ error: 'File not found' }))
              return
            }
            fs.unlinkSync(filePath)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Invalid JSON' }))
          }
        })
      })

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
