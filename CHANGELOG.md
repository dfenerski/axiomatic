# Changelog

## v0.0.9

### Carousel notes panel

- **Ctrl+L in carousel** — opens the notes panel for the current snip's original page and PDF, using the same `NotesPanel`/`useNotes` infrastructure as the reader. Notes panel appears as a 384px side pane on the right.
- **Ctrl+H in carousel** — closes notes if the editor is focused; otherwise exits the carousel.
- **Notes follow navigation** — slug/page update automatically when advancing through snips with j/k.
- **`.cm-editor` focus guard** — j/k/Space/Escape no longer fire while typing in the notes editor.

### Snip table vim keys

- **l expands** — expands the inline preview for the highlighted row.
- **h collapses** — collapses the highlighted row's preview.
- **Ctrl+L opens notes** — toggles notes panel for the highlighted snip's page, with editor auto-focus.
- **Ctrl+H closes notes / navigates back** — closes the notes panel if open; otherwise navigates to the library.

### Overview page keyboard shortcuts

- **Ctrl+S** — navigate to snips page.
- **Ctrl+D** — toggle directory explorer.
- **Ctrl+T** — toggle tag manager.
- **Ctrl+F** — toggle search filter.

### Global Escape closes panes

- **Escape always works** — Escape now closes open panes (notes, tag manager, tag assigner, directory explorer, search filter) regardless of which element has focus. Previously, Escape was blocked when focus was in an `<input>`, `<textarea>`, or `.cm-editor`.
- **Priority chain** — panes close in order: notes → tag manager → tag assigner → selection → navigate home.
- **Tag manager inputs fixed** — "New tag" and rename inputs in `SnipTagManager` and `TagManager` no longer `stopPropagation` on Escape, so the document-level close handler fires correctly.

### Snip table sort order

- **Default sort: timestamp → slug → page** — snips are now sorted by creation timestamp first, then by document slug, then by page number (was page-only).

### Tests

- **New**: LoopCarousel notes panel tests (5), SnipsPage vim expand/collapse + notes + Escape tests (7), OverviewPage keyboard shortcut tests (7), SnipTagManager Escape test, TagManager Escape test.
- **360 Vitest tests**, 44 Rust tests — all passing.

## v0.0.8

### Snip loop overlay parity

- **PomodoroTimer in SnipsPage overlays** — both loop and view carousel overlays now render the Pomodoro timer above the carousel, matching the dedicated `/loop/:slug` page.

### Zoomable snip images

- **New `ZoomableSnipImage` component** — reusable wrapper around `SnipImage` with zoom +/- buttons, Ctrl+=/Ctrl+-/Ctrl+0 keyboard shortcuts, and Ctrl+wheel zoom.
- **LoopCarousel zoom** — zoom controls in the carousel navigation bar; zoom resets on snip change. Card expands to `max-w-[90vw]` when revealed to fit natural snip size.
- **SnipsPage expanded row zoom** — inline preview now uses `ZoomableSnipImage` instead of a bare fixed-size `SnipImage`.
- **Original-size reveal** — revealed snips render at their native canvas pixel dimensions, capped at 80vh with overflow scroll.
- **`onSize` callback** — `SnipImage` reports natural canvas dimensions directly after image load. `ZoomableSnipImage` uses this instead of `ResizeObserver`, eliminating the race condition where navigating to a new snip showed a cut-off image on first reveal.

### Toggleable select mode (snip table)

- **Select mode toggle** — checkbox icon button in the SnipsPage toolbar toggles selection checkboxes on/off. Checkboxes hidden by default; turning select mode off clears all selections.

### Bulk tag via context menu

- **Multi-select + right-click + tag** — when right-clicking a snip that's part of a multi-selection, tag checkboxes apply to all selected snips (grouped by directory for the bulk IPC call). Header shows "Tag N snips".

### Searchable tag filter

- **Wider dropdown** — tag filter dropdown widened to `w-56`.
- **Search input** — text filter at the top of the dropdown; filters tags by substring match. Clears on dropdown close.

### Space toggle in carousel

- **Space as global expand toggler** — Space now toggles reveal/hide in both loop and view modes (previously only revealed, and was a no-op in view mode).

### Snip table improvements

- **Persistent filters** — search, directory filter, and tag filter survive navigation away and back (module-level cache).
- **Ascending page sort** — snips sorted by page number ascending (was descending by creation date). Sorted carousel mode inherits this order.
- **Back button in overlays** — loop and view carousel overlays now have a visible back arrow button in the toolbar.

### Overview toolbar layout

- **Snips button moved** — now between the directory explorer and tag manager buttons (left side of toolbar), instead of the right side next to filter.

### Tests

- **New**: `ZoomableSnipImage` onSize callback tests, `LoopCarousel` zoom controls + keyboard/wheel shortcuts + Space toggle tests, `SnipsPage` select mode + bulk tag + searchable dropdown + page sort + back button tests.
- **Updated**: `OverviewPage` snips button position test reflects new toolbar order.
- **334 Vitest tests**, 44 Rust tests — all passing.

## v0.0.7

### Navigation overhaul

- **Removed root sidebar** — the vertical Projects/Snips/Stats sidebar is gone; navigation is now inline in each page's toolbar.
- **Snips button in overview toolbar** — open-book icon links to `/snips`, placed before the filter button.
- **Snips button in reader toolbar** — same open-book icon in the reader, gated behind the learning tools toggle.
- **Stats via command palette** — "Show stats" command available on the overview page (`Ctrl+P`), navigates to `/stats`.
- **Titlebar simplified** — Linux layout no longer has a sidebar gap; macOS/Windows titlebar unchanged.

### Pomodoro timer relocation

- **Removed from snips page** — the timer was redundant on the snip table view.
- **Added to loop page** — PomodoroTimer now renders between the tab bar and carousel on `/loop/:slug`, with `activeSlug` for session logging.
- **Global timer state preserved** — the module-level timer store is shared across reader and loop pages; navigating between them keeps the timer running.

### Toolbar fixes

- **Reader toolbar right-alignment** — added `ml-auto` to the right section so search/palette buttons stay at the right edge regardless of title width.

### Commands

- **`buildCommands` refactored** — now takes an options object `{ isReader, isOverview, theme, navigate }` instead of positional args.

### Tests

- **New**: `Titlebar` nav link tests (removed with sidebar), `OverviewPage` toolbar nav tests, `LoopPage` PomodoroTimer test, `ReaderToolbar` Snips link and right-alignment tests.
- **Removed**: `Sidebar.test.tsx` (component deleted).
- **Updated**: `SnipsPage` timer assertion flipped, `commands.test.ts` adapted to new signature.

## v0.0.6

### Command palette

- **Ctrl+P command palette** — floating overlay with fuzzy substring filtering, arrow key navigation, and Enter to execute. Available on both overview and reader pages via keyboard shortcut or toolbar button.
- **Theme commands** — "Use OS theme" and "Switch to light/dark mode" accessible from the palette on any page.
- **Reader commands** — toggle outline, notes, bookmarks, highlights, and zen mode from the palette. Shortcut hints displayed inline.
- **`setTheme()` export** — `useTheme.ts` now exports a `setTheme(theme)` function for direct theme setting (used by the palette; `cycle` reuses it internally).

### Zen mode

- **Distraction-free reading** — toggle via command palette hides toolbar, tab bar, outline, bookmarks, and highlights panels.
- **Notes in zen mode** — notes panel remains openable (Ctrl+L or command palette) for annotation while in zen mode.
- **ESC to exit** — pressing Escape exits zen mode and restores all chrome.

### Toolbar redesign

- **Decluttered reader toolbar** — moved outline, notes, bookmarks, highlights, and theme toggle buttons into the command palette. Toolbar now shows: back, page counter, zoom, title (centered), search, and palette button.
- **Removed ThemeToggle from overview** — theme switching now exclusively via command palette (Ctrl+P).
- **Toolbar layout** — zoom controls moved to left section next to page counter; title centered; search and palette button on the right.

### Keyboard handling

- **Text field safety** — `useVimReader` and `ReaderPage` keyboard shortcuts now skip when focus is in an `<input>` or `<textarea>`. Fixes space/j/k/arrows triggering PDF scroll while typing in the search bar or command palette.

## v0.1.0

### PDFium migration

Replaced pdfjs-dist (JS-based PDF rendering) with [PDFium](https://pdfium.googlesource.com/pdfium/) via the `pdfium-render` Rust crate. All PDF operations now happen natively in Rust.

- **Custom protocol** — `pdfium://localhost/render?path=...&page=...&width=...&dpr=...` serves page images as JPEG. Both thumbnails and the full viewer use this protocol; no JS worker or IndexedDB cache needed.
- **Render thread** — dedicated `std::thread` processes page renders, text extraction, outline/link queries, clipping, and search via an `mpsc` channel (`pdf_engine.rs`).
- **Off-thread document open** — `open_document` runs on `spawn_blocking`, bypassing the render thread entirely for instant document info retrieval.
- **Generation counter** — `AtomicU64` tags each render request; stale renders (from a previous document) are preempted instantly.
- **JPEG encoding** — pages encoded as JPEG (quality 90) instead of PNG for ~5x faster encoding.
- **LRU render cache** — 50-entry cache avoids re-rendering pages during scroll back-and-forth.
- **Native text layer** — character-level bounding boxes extracted from PDFium for text selection, highlight creation, and search (replaces pdfjs text layer).
- **Native outline & links** — table of contents and hyperlink annotations read directly from PDFium.
- **PDF clipping** — extract page ranges into new PDF files, fully native.

### Highlights & bookmarks

- **Text-selection highlights** — select text on a PDF page, right-click to create a colored highlight (yellow, orange, blue, green). Highlights stored in SQLite with normalized coordinates, text content, and group IDs for multi-rect selections.
- **Bookmarks as transparent highlights** — "Bookmark" option in the context menu creates a highlight with `color = "bookmark"` (no visible overlay). Replaces the old page-level bookmark toggle.
- **Highlights panel** — resizable side pane listing all colored highlights grouped by page, with text previews. Click to navigate; delete individual highlights or groups.
- **Bookmarks panel** — same structure for bookmark-type highlights; resizable, grouped by page.
- **Anchor navigation** — clicking a highlight/bookmark in either pane saves the current reading position and shows a "back to p.X" button in the toolbar. Works the same as search navigation.

### Tabs

- **Tab bar** — horizontal tab strip below the toolbar showing all open documents. Click to switch; X button or middle-click to close.
- **Ctrl+W** — close current tab (navigates to next tab or back to library).
- **Ctrl+Shift+T** — reopen last closed tab.
- **Shift+Alt+H / Shift+Alt+L** — switch to previous / next tab.
- **Tab state persistence** — open tabs stored in `useTabs` hook with reopen stack.

### Performance

- **Imperative zoom** — zoom changes apply instantly via CSS `transform: scale()` (GPU-composited) without React re-renders. Layout re-renders are debounced (300ms) and wrapped in `startTransition` for interruptibility. `PdfViewer` uses `forwardRef` + `useImperativeHandle` + `React.memo`.
- **Continuous zoom** — Ctrl+wheel and toolbar buttons use a continuous zoom model (`MIN_ZOOM=0.25`, `MAX_ZOOM=5`, `ZOOM_FACTOR=1.1`) instead of fixed steps, enabling smooth zooming.
- **Deferred text/link loading** — text layer and link annotations load 500ms after page render to avoid competing with initial visible page renders.
- **Module-level caching** — textbook list (`useTextbooks`) and document info (`useDocument`) cached at module scope; navigating between library and reader doesn't re-fetch.
- **Thumbnail queue** — simplified to a pure concurrency limiter (`thumbnail-queue.ts`, `MAX_CONCURRENT=3`); thumbnails load via `pdfium://` protocol as `<img>` tags — no canvas rendering or IndexedDB caching needed.
- **Off-thread thumbnail prerender** — `PdfThumbnail` calls `prerender_pages` via IPC (`spawn_blocking`) before mounting the `<img>` tag, ensuring the `pdfium://` protocol handler always hits the `SharedRenderCache`. Eliminates main-thread blocking during thumbnail loads — fixes "unresponsive app" dialog on aggressive scroll (Linux/WebKitGTK).

### Layout

- **Resizable panes** — outline, highlights, bookmarks, and notes panes all support drag-to-resize.
- **Outline sidebar** — table of contents rendered from PDFium bookmarks in a collapsible tree; Ctrl+B to toggle.
- **Clip dialog** — select page range and export to a new PDF file.

## v0.0.5

### Added

- **Arrow key navigation in overview grid** — arrow keys now work alongside h/j/k/l for grid navigation (`useVimOverview.ts`)
- **Arrow key scrolling in reader** — arrow up/down scroll the PDF, matching j/k behavior (`useVimReader.ts`)
- **Space to page down in reader** — scrolls one full viewport height (`useVimReader.ts`)
- **Ctrl-h to return to library from reader** — navigates back to the overview page; mirrors existing Ctrl-h (notes → PDF pane) for a consistent "go back one level" pattern (`useVimReader.ts`)
- **Ctrl-+/- zoom in reader** — keyboard zoom in/out through the same steps as the toolbar buttons, works regardless of active pane (`useVimReader.ts`)
- **Native GTK header bar on Linux** — platform-specific config override (`tauri.linux.conf.json`) with `decorations: true` and `transparent: false`; non-Linux platforms keep the floating-card custom titlebar
- **GTK theme syncing** — `useTheme.ts` calls `getCurrentWindow().setTheme()` on every theme change (manual toggle, OS detection, matchMedia), so the native GTK header follows dark/light/system mode
- **PDF file association** — `fileAssociations` in `tauri.conf.json` generates `MimeType=application/pdf` in the `.desktop` file; right-click a PDF → "Open With Axiomatic"
- **Single-instance support** — `tauri-plugin-single-instance` forwards second-launch args to the running instance via an `open-file` event instead of spawning a new window
- **Open file from CLI / file manager** — `open_file` command auto-adds the parent directory if not tracked and returns the slug; `get_pending_file` hands the startup path to the frontend for immediate navigation
- **`get_platform` command** — returns `std::env::consts::OS` for platform-conditional layout
- **App icon** — regenerated all `src-tauri/icons/` from `Logo_light-02-01.svg`; favicon updated to match

### Changed

- **`productName`** capitalized to `"Axiomatic"` (controls `.desktop` Name= and package metadata)
- **Capabilities** — added `core:window:allow-set-theme`, `core:event:default`
- **Dependencies** — added `tauri-plugin-single-instance = "2"`, `url = "2"`

### Fixed

- **Light-mode text shimmer on hover** — titles shifted weight when hovering over tiles. Caused by missing global font-smoothing and bare `transition` classes triggering GPU layer promotion that switched text anti-aliasing. Fixed by adding global `-webkit-font-smoothing: antialiased` and removing a no-op hover color class (`index.css`, `BookTile.tsx`)
- **Thumbnail flicker on hover** — thumbnails flickered when moving the cursor quickly across the overview grid. Overlay opacity transitions (star button, tag badges) triggered GPU layer promotion/demotion cycles that forced the entire `overflow:hidden` + `border-radius` stacking context to re-composite. Fixed by removing all CSS transitions from BookTile (hover effects are now instant) and wrapping `PdfThumbnail` in `memo` (`BookTile.tsx`, `PdfThumbnail.tsx`; see `docs/fix-light-mode-text-shimmer.md`)
