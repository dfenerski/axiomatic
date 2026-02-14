# Changelog

## v0.0.5

### Added

- **Arrow key navigation in overview grid** — arrow keys now work alongside h/j/k/l for grid navigation (`useVimOverview.ts`)
- **Arrow key scrolling in reader** — arrow up/down scroll the PDF, matching j/k behavior (`useVimReader.ts`)
- **Space to page down in reader** — scrolls one full viewport height (`useVimReader.ts`)
- **Ctrl-h to return to library from reader** — navigates back to the overview page; mirrors existing Ctrl-h (notes → PDF pane) for a consistent "go back one level" pattern (`useVimReader.ts`)
- **Ctrl-+/- zoom in reader** — keyboard zoom in/out through the same steps as the toolbar buttons, works regardless of active pane (`useVimReader.ts`)

### Fixed

- **Light-mode text shimmer on hover** — titles shifted weight when hovering over tiles. Caused by missing global font-smoothing and bare `transition` classes triggering GPU layer promotion that switched text anti-aliasing. Fixed by adding global `-webkit-font-smoothing: antialiased` and removing a no-op hover color class (`index.css`, `BookTile.tsx`)
- **Thumbnail flicker on hover** — thumbnails flickered when moving the cursor quickly across the overview grid. Overlay opacity transitions (star button, tag badges) triggered GPU layer promotion/demotion cycles that forced the entire `overflow:hidden` + `border-radius` stacking context to re-composite. Fixed by removing all CSS transitions from BookTile (hover effects are now instant) and wrapping `PdfThumbnail` in `memo` (`BookTile.tsx`, `PdfThumbnail.tsx`; see `docs/fix-light-mode-text-shimmer.md`)
