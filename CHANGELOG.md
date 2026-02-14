# Changelog

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
