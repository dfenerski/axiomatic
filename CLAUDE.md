# Axiomatic

Solarized-themed desktop PDF reader for math textbooks. Tauri 2 + React 19 + TypeScript.

## Quick reference

```
src/pages/OverviewPage.tsx    — library grid (starred section + per-directory sections)
src/pages/ReaderPage.tsx      — PDF viewer + notes split-pane
src/components/PdfThumbnail.tsx — lazy thumbnail pipeline (see docs/pdf-pipeline.md)
src/components/PdfViewer.tsx  — virtual-scroll PDF renderer (buffer=5 pages)
src/components/NotesPanel.tsx — CodeMirror 6 with vim, markdown, KaTeX math
src/lib/load-queue.ts        — concurrency limiter (MAX_CONCURRENT=2)
src-tauri/src/commands.rs     — all Tauri IPC commands
src-tauri/src/db.rs           — SQLite schema (directories, notes, note_images)
```

## Architecture

```
React (Vite + SWC)  <--IPC-->  Tauri/Rust  <--->  SQLite
                                            <--->  File system (PDF dirs)
```

Routes: `/` OverviewPage, `/read/:slug` ReaderPage. Layout wraps both with custom Titlebar.

## State management

| Data | Where | Pattern |
|------|-------|---------|
| Progress (page/total) | localStorage | `createLocalStorageStore` + `useSyncExternalStore` |
| Starred books | localStorage | same |
| Theme | localStorage | custom store with OS detection (dbus + matchMedia) |
| Notes | SQLite | in-memory Map cache, 150ms debounced writes |
| Thumbnails | IndexedDB v2 | `thumbnail-cache.ts`, keyed by slug |

`createLocalStorageStore` (lib/createStore.ts) is a generic factory: `load()` returns parsed snapshot, `emitChange()` re-reads from localStorage and notifies subscribers. Beware: `JSON.parse` creates new object references for every entry on every emit — use value-based memo comparators (see BookTile).

## Performance-critical paths

**Thumbnail pipeline** — see `docs/pdf-pipeline.md` for the full diagram. Key invariant: the load-queue holds each slot for the entire render lifecycle (not just file I/O), so at most MAX_CONCURRENT PDFs are being parsed by pdfjs-dist at once.

**OverviewPage re-renders** — `BookTile` is `memo`'d with a custom comparator that checks `progress.currentPage` and `progress.totalPages` by value (not reference), because the localStorage store creates fresh objects on every read. `handleTotalPages` uses a ref to avoid depending on the `progress` object.

**useBatchedRender** — progressively mounts BookTiles in batches of 20 via requestAnimationFrame, preventing initial load from blocking the main thread.

**SyncStatus** subscribes to queue progress directly (not through OverviewPage state) so progress bar updates don't re-render the page.

## Conventions

- Solarized palette: hard-coded hex values (`#fdf6e3` light bg, `#002b36` dark bg, etc.)
- Tailwind 4 with `dark:` variants; dark mode toggled via `<html class="dark">`
- Vim keybindings everywhere: h/j/k/l in overview grid, j/k scroll in reader, full vim in notes editor
- No component library — all UI is hand-written
- PDFs served via Tauri asset protocol (`convertFileSrc(fullPath)`)

## Commands

```bash
npm run dev          # tauri dev (vite + rust)
npm run build        # tauri build
npm run vite:dev     # vite only (no tauri)
npx tsc --noEmit     # type-check
```

## Known gotchas

- `readFile` from `@tauri-apps/plugin-fs` deserializes entire file on JS main thread — never use for thumbnails (50MB+ math textbooks freeze the UI). Thumbnails use asset URLs fetched by pdfjs worker instead.
- IndexedDB thumbnail cache uses DB_VERSION for cache busting. Bump version in `thumbnail-cache.ts` if the cached format changes.
- `loadProgress()` / `loadStarred()` do `JSON.parse` on every call, creating new object trees. Any `useMemo` or `memo` that depends on entries from these maps must compare by value, not reference.
- pdfjs worker configured in `main.tsx` — must point to the react-pdf bundled worker path.
