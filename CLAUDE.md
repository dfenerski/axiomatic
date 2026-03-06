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
src/hooks/useSnips.ts           — snip CRUD + XP tracking (IPC → .axiomatic/ JSON)
src/components/SlugMigrationDialog.tsx — orphan slug detection + migration dialog
src-tauri/src/commands.rs        — general Tauri IPC commands (db, files, tags, project state)
src-tauri/src/highlight_commands.rs — highlight CRUD IPC commands
src-tauri/src/snip_commands.rs   — snip CRUD IPC commands
src-tauri/src/pdf_commands.rs    — PDF-specific IPC commands (open, outline, links, text, search, clip)
src-tauri/src/pdf_engine.rs      — PDFium render thread (mpsc recv loop, LRU cache)
src-tauri/src/pdf_protocol.rs    — pdfium:// custom protocol handler
src-tauri/src/db.rs              — SQLite schema + versioned migration framework (directories, notes, note_images, tags, highlights)
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
| Progress (page/total) | `.axiomatic/progress.json` | IPC `get_all_progress`/`save_progress`, 300ms debounced writes |
| Starred books | `.axiomatic/starred.json` | IPC `get_starred`/`toggle_starred`, optimistic toggle |
| Snips | `.axiomatic/snips.json` | IPC `list_snips`/`create_snip`/`delete_snip`, UUID IDs |
| Snip XP | `.axiomatic/xp.json` | IPC `get_xp`/`increment_xp`, per-slug counter |
| Theme | localStorage | custom store with OS detection (dbus + matchMedia) |
| Notes | SQLite | in-memory Map cache, 150ms debounced writes |
| Highlights | SQLite | `useHighlights` hook, bookmarks stored as `color="bookmark"` |
| Tabs | localStorage | `useTabs` hook with reopen stack + `useTabNavigation` for route-aware nav |

`createLocalStorageStore` (lib/createStore.ts) is a generic factory for remaining localStorage state (theme, tabs): `load()` returns parsed snapshot, `emitChange()` re-reads from localStorage and notifies subscribers.

**Three-tier storage:** SQLite (structured relational: notes, highlights, tags), `.axiomatic/` ProjectStateDir (portable per-book JSON: progress, starred, snips, XP), localStorage (ephemeral UI: theme, tabs). Each library directory has its own `.axiomatic/` dir — copying the library folder preserves all per-book state.

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

**Snip mode** — activated via command palette. Renders a `SnipOverlay` (crosshair cursor) on each visible PDF page. Drag to select a normalized rect (0–1 coordinates). On mouseup, `SnipBanner` appears for labeling. Saved snips persist to `.axiomatic/snips.json` via `snip_commands.rs` (UUID IDs, ISO-8601 timestamps).

**Reader state bridge** — `readerState.ts` is a module-level store (not React state) that exposes `snipMode` and `hasSnips` to the Layout/command palette via `useSyncExternalStore`. ReaderPage writes; router.tsx reads. This avoids prop drilling across the route boundary.

**Loop page** (`/loop/:slug`) — carousel of snips for a given book. Modes: sorted (creation order) or shuffled (Fisher-Yates, computed once on mount). Navigation: j/k or arrow keys, Space to reveal, ESC to exit. XP counter persisted per-slug in `.axiomatic/xp.json` via IPC. `LoopCarousel` crops the snip region from a full-page `pdfium://` render using canvas `drawImage`.

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
- Bookmarks are highlights with `color = "bookmark"` — `useHighlights` splits them via `colorHighlights` / `bookmarkHighlights`.
- **Slug migration** — When a PDF is renamed, `detect_orphaned_slugs` finds data referencing unknown slugs and suggests mappings via bigram similarity. `migrate_slug` atomically updates all storage tiers (SQLite + JSON + localStorage tabs). The `SlugMigrationDialog` surfaces after library scan on OverviewPage.
- **Versioned migrations** — `db.rs` uses a `migrations` table with sequential version numbers. Add new migrations to the `MIGRATIONS` array; `init_db()` runs pending ones on startup.

---

# axiomatic-pdfium — DDD Dashboard

> Cache iteration: 31

## Orchestrator Directive

You are the DDD orchestrator. Dispatch phase agents, manage transitions, own global state.
Commands: /ddd-begin, /ddd-explore, /ddd-spec, /ddd-plan, /ddd-exec, /ddd-gate, /ddd-approve, /ddd-clarify, /ddd-rewind, /ddd-status, /ddd-cache, /ddd-refactor, /ddd-onboard, /ddd-amend, /ddd-migrate.

## Phase & Iteration

Phase: **exec** | Iteration: **31**

## Active Traversals

None

## Artifact Index

### Concept

- `concept/fragment-001.md` — PDF rendering pipeline
- `concept/fragment-002.md` — Document management
- `concept/fragment-003.md` — Annotation system
- `concept/fragment-004.md` — Study features
- `concept/fragment-005.md` — Navigation & UI
- `concept/fragment-006.md` — Persistence
- `concept/fragment-007.md` — Platform concerns
- `concept/fragment-008.md` — First-class snippet support (seeded from cl-005)
- `concept/fragment-009.md` — AI-enabled highlights (seeded from cl-006)
- `concept/fragment-010.md` — Retroactive TDD adoption (seeded from cl-007)
- `concept/fragment-011.md` — Pomodoro/timer feature (seeded from cl-008)
- `concept/explore-summary.md` — Explore phase synthesis (cycle 1 + 2)
- `concept/atoms.yaml` — 58 atoms (49 cycle 1 + 9 cycle 2: 3 snippet, 3 testing, 3 pomodoro)

### Specs

| Sub-spec | Title | Approval |
|----------|-------|----------|
| spec-rendering | PDF Rendering Pipeline | **approved** (iter 27) |
| spec-text-extraction | Text Extraction & Spatial Model | **approved** (iter 27) |
| spec-documents | Document Management & Library | **approved** (iter 28) |
| spec-annotations | Annotation System | **approved** (iter 27) |
| spec-study | Study Features (Snips, Tags, Filtering & Loop Review) | **approved** (iter 28) |
| spec-navigation | Navigation & Interaction | **approved** (iter 27) |
| spec-persistence | Persistence & Storage | **approved** (iter 27) |
| spec-platform | Platform & Runtime | **approved** (iter 27) |
| spec-testing | Full-Stack Test Infrastructure | **approved** (iter 25) |
| spec-pomodoro | Pomodoro Study Timer & Statistics | **approved** (iter 28) |

### Tasks

| Task | Title | Status |
|------|-------|--------|
| task-001 | Versioned migration framework | done |
| task-002 | ProjectStateDir creation & walkdir filtering | done |
| task-003 | Move BookProgress to .axiomatic/ | done |
| task-004 | Move StarredSet to .axiomatic/ | done |
| task-005 | Move Snips to .axiomatic/ | done |
| task-006 | Move SnipXP to .axiomatic/ | done |
| task-007 | Slug migration | done |
| task-008 | Snip tags backend and model update | **pending** |
| task-009 | Snip table view page with search and navigation | **pending** (blocked by 008) |
| task-010 | Snip filtering and cross-book loop overlay | **pending** (blocked by 009) |
| task-011 | Pomodoro timer with presets and break notifications | **pending** |
| task-012 | Pomodoro session logging and XP backend | **pending** |
| task-013 | Study statistics on OverviewPage | **pending** (blocked by 012) |
| task-014 | Rust unit tests for all mutating IPC commands | **pending** |
| task-015 | Vitest infrastructure and frontend tests | **pending** |
| task-016 | Playwright E2E infrastructure and happy-path tests | **pending** |

## Open Clarifications

| ID | Topic | Status |
|----|-------|--------|
| cl-006 | AI-enabled highlights | **open** (deferred) |

## Approval Status

All 10 sub-specs approved (111 ACs, 58 atoms). Plan: **approved** (iter 30, 9 tasks). Exec phase active.

## Recent Decisions

- [iter 28] Cross-spec coherence fixes: ac-033 completeness, ac-147 ZenMode, ac-148 config persistence, cross-book loop overlay constraint
- [iter 29] Gate passed: spec → plan (111 ACs, 58 atoms, 10 specs approved)
- [iter 29] Cycle 2 plan decomposition: brownfield gap analysis, 9 tasks in 3-layer DAG
- [iter 30] Approved plan: 9 tasks (task-008..016), 35 ACs covered, critical path 008→009→010
- [iter 31] Gate passed: plan → exec (9 pending tasks, entering cycle 2 implementation)
