# Axiomatic

Solarized-themed desktop PDF reader for math textbooks. Tauri 2 + React 19 + TypeScript.

## Quick reference

```
src/pages/OverviewPage.tsx       — library grid (starred section + per-directory sections)
src/pages/ReaderPage.tsx         — PDF viewer + notes split-pane + tabs + snip mode
src/pages/LoopPage.tsx           — snip review carousel (sorted/shuffled modes)
src/components/PdfThumbnail.tsx  — lazy thumbnail via pdfium:// protocol
src/components/PdfViewer.tsx     — virtual-scroll PDF renderer (buffer=5 pages, imperative zoom)
src/components/NotesPanel.tsx    — CodeMirror 6 with vim, markdown, KaTeX math
src/components/TabBar.tsx        — horizontal tab strip with context menu (close, close others)
src/components/HighlightsPanel.tsx — highlights list pane (grouped by page)
src/components/BookmarksPanel.tsx  — bookmarks list pane (highlights with color="bookmark")
src/components/CommandPalette.tsx — Ctrl+P command palette (panel toggles, theme, zen mode, snip, loop)
src/components/ReaderToolbar.tsx — reader toolbar (back, page counter, zoom, search, palette button)
src/components/SnipOverlay.tsx   — drag-to-select crosshair overlay for snip region capture
src/components/SnipBanner.tsx    — inline label input banner shown after snip region selection
src/components/LoopCarousel.tsx  — flashcard carousel with reveal, prev/next, XP tracking
src/lib/thumbnail-queue.ts      — concurrency limiter (MAX_CONCURRENT=3)
src/lib/palette.ts              — module-level toggle callback for command palette
src/lib/readerState.ts          — module-level store bridging ReaderPage state to Layout/palette
src/hooks/useTheme.ts           — theme store with setTheme() export for direct setting
src/hooks/useSnips.ts           — snip CRUD + XP tracking (SQLite + localStorage)
src-tauri/src/commands.rs        — general Tauri IPC commands (db, files, tags)
src-tauri/src/highlight_commands.rs — highlight CRUD IPC commands
src-tauri/src/snip_commands.rs   — snip CRUD IPC commands
src-tauri/src/pdf_commands.rs    — PDF-specific IPC commands (open, outline, links, text, search, clip)
src-tauri/src/pdf_engine.rs      — PDFium render thread (mpsc recv loop, LRU cache)
src-tauri/src/pdf_protocol.rs    — pdfium:// custom protocol handler
src-tauri/src/db.rs              — SQLite schema (directories, notes, note_images, tags, highlights, snips)
```

## Architecture

```
React (Vite + SWC)  <──IPC──>  Tauri/Rust  <───>  SQLite
                    <──pdfium://>  PDFium   <───>  File system (PDF dirs)
```

PDF rendering uses PDFium (C library) via `pdfium-render` crate. Pages served as JPEG via `pdfium://` custom protocol. Render thread handles page rendering, text extraction, outlines, links, search, and clipping. Document open runs on `spawn_blocking` (off the render thread) for instant response.

Routes: `/` OverviewPage, `/read/:slug` ReaderPage, `/loop/:slug` LoopPage. Layout wraps all with custom Titlebar.

## State management

| Data | Where | Pattern |
|------|-------|---------|
| Progress (page/total) | localStorage | `createLocalStorageStore` + `useSyncExternalStore` |
| Starred books | localStorage | same |
| Theme | localStorage | custom store with OS detection (dbus + matchMedia) |
| Notes | SQLite | in-memory Map cache, 150ms debounced writes |
| Highlights | SQLite | `useHighlights` hook, bookmarks stored as `color="bookmark"` |
| Snips | SQLite | `useSnips` hook, rectangular PDF region flashcards |
| Snip XP | localStorage | per-slug counter in `useSnips`, key `snipXp:{slug}` |
| Tabs | localStorage | `useTabs` hook with reopen stack + `useTabNavigation` for route-aware nav |

`createLocalStorageStore` (lib/createStore.ts) is a generic factory: `load()` returns parsed snapshot, `emitChange()` re-reads from localStorage and notifies subscribers. Beware: `JSON.parse` creates new object references for every entry on every emit — use value-based memo comparators (see BookTile).

## Performance-critical paths

**Thumbnail pipeline** — see `docs/pdf-pipeline.md`. Thumbnails are `<img>` tags pointing at `pdfium://` URLs. `thumbnail-queue.ts` limits concurrent loads to 3; no IndexedDB cache needed.

**Zoom** — two-tier imperative system. Immediate: CSS `transform: scale()` via `useImperativeHandle` (no React re-render). Committed: 300ms debounced `startTransition` re-render for layout recalculation. See `docs/pdf-pipeline.md` for details.

**Document open** — `open_document` runs on `spawn_blocking`, not the render thread. Generation counter (`AtomicU64`) preempts stale renders. Module-level caches in `useDocument` and `useTextbooks` avoid re-fetching on navigation.

**OverviewPage re-renders** — `BookTile` is `memo`'d with a custom comparator that checks `progress.currentPage` and `progress.totalPages` by value (not reference), because the localStorage store creates fresh objects on every read. `handleTotalPages` uses a ref to avoid depending on the `progress` object.

**useBatchedRender** — progressively mounts BookTiles in batches of 20 via requestAnimationFrame, preventing initial load from blocking the main thread.

## Command palette & zen mode

**Command palette** (`Ctrl+P` or toolbar button) — floating overlay with fuzzy filter. Available on both overview and reader pages. Commands:
- Always: theme switching (OS / light / dark)
- Reader only: toggle outline, notes, bookmarks, highlights, zen mode, snip mode
- Reader only (when snips exist): loop sorted, loop shuffled

Panel toggle commands dispatch `CustomEvent` on `window` (e.g. `axiomatic:toggle-outline`), listened to by `ReaderPage`. The palette button uses a module-level callback (`src/lib/palette.ts`) to avoid circular imports between `router.tsx` and page/component modules.

**Zen mode** — hides toolbar, tabs, outline, bookmarks, and highlights panels. Notes remain openable (Ctrl+L or command palette). ESC exits zen mode.

**Toolbar layout** (reader): Left (back, page counter, zoom) | Center (title) | Right (search, palette button).

**Keyboard safety** — `useVimReader` and `ReaderPage` keyboard handlers skip all non-modifier keys when `document.activeElement` is an `<input>` or `<textarea>`, preventing vim navigation from interfering with the command palette, search bar, or any future text fields.

## Snip mode & loop review

**Snip mode** — activated via command palette. Renders a `SnipOverlay` (crosshair cursor) on each visible PDF page. Drag to select a normalized rect (0–1 coordinates). On mouseup, `SnipBanner` appears for labeling. Saved snips persist to SQLite (`snips` table) via `snip_commands.rs`.

**Reader state bridge** — `readerState.ts` is a module-level store (not React state) that exposes `snipMode` and `hasSnips` to the Layout/command palette via `useSyncExternalStore`. ReaderPage writes; router.tsx reads. This avoids prop drilling across the route boundary.

**Loop page** (`/loop/:slug`) — carousel of snips for a given book. Modes: sorted (creation order) or shuffled (Fisher-Yates, computed once on mount). Navigation: j/k or arrow keys, Space to reveal, ESC to exit. XP counter persisted per-slug in localStorage. `LoopCarousel` crops the snip region from a full-page `pdfium://` render using canvas `drawImage`.

**Route-aware tabs** — `OpenTab` now carries a `route` field. `useTabNavigation` wraps `useTabs` with `navigate()` calls that respect the stored route, enabling non-reader tabs (e.g. loop tabs with slug `loop:{slug}`).

## Conventions

- Solarized palette: hard-coded hex values (`#fdf6e3` light bg, `#002b36` dark bg, etc.)
- Tailwind 4 with `dark:` variants; dark mode toggled via `<html class="dark">`
- Vim keybindings everywhere: h/j/k/l in overview grid, j/k scroll in reader, full vim in notes editor
- No component library — all UI is hand-written
- PDFs rendered via `pdfium://` custom protocol (native PDFium, JPEG output)

## Commands

```bash
npm run dev          # tauri dev (vite + rust)
npm run build        # tauri build
npm run vite:dev     # vite only (no tauri)
npx tsc --noEmit     # type-check
```

## Known gotchas

- PDFium shared library (`libpdfium.so`/`.dylib`/`.dll`) must be in `src-tauri/resources/` for dev or bundled as a Tauri resource for production. Download from https://github.com/bblanchon/pdfium-binaries.
- `Pdfium` is `Box::leak`'d to `&'static` — shared via `PdfiumHandle` wrapper (unsafe Send+Sync) and `usize` pointer casts for closures. See `lib.rs` setup.
- `loadProgress()` / `loadStarred()` do `JSON.parse` on every call, creating new object trees. Any `useMemo` or `memo` that depends on entries from these maps must compare by value, not reference.
- Bookmarks are highlights with `color = "bookmark"` — `useHighlights` splits them via `colorHighlights` / `bookmarkHighlights`.
