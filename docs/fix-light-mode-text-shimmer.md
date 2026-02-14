# Fix: Light-mode text shimmer and thumbnail flicker on hover

**Date:** 2026-02-14
**Files:** `src/index.css`, `src/components/BookTile.tsx`, `src/components/PdfThumbnail.tsx`

## Symptom

In light mode, PDF titles in the overview grid appeared to shift weight (bold/unbold) and thumbnails flickered when hovering over tiles or moving the mouse quickly. Dark mode was unaffected.

## Root cause

Four issues working together:

### 1. No global font-smoothing

The app had no `-webkit-font-smoothing` set, so light-mode text used **subpixel anti-aliasing** by default. Any CSS transition that triggered GPU layer promotion would switch text to **grayscale anti-aliasing**, causing a visible weight shift.

### 2. Overlay transitions causing GPU layer churn (primary flicker cause)

The star button and tag overlay inside each BookTile used CSS opacity transitions (`transition-[opacity,background-color]`, `transition-opacity`). On every group-hover, the browser promoted these overlays to GPU-composited layers to animate them. Because the overlays sit inside a `position: relative` container with `overflow: hidden` + `border-radius`, the browser was forced to re-composite the entire stacking context — including the thumbnail `<img>` — across multiple animation frames. Moving the cursor quickly across tiles caused rapid promote/demote cycles, manifesting as visible thumbnail flicker. This was especially pronounced in WebKitGTK (Tauri on Linux).

### 3. Bare `transition` on the Link wrapper

Tailwind's bare `transition` class expands to all visual properties. The `<Link>` wrapper originally had this, causing the entire tile (including text and thumbnail) to be promoted to a GPU layer on hover background change. Even after scoping to `transition-colors`, the background-color animation still triggered layer promotion.

### 4. No-op hover color class

The title `<span>` had `group-hover:text-[#073642]` which set the same color as the default, pointlessly engaging the color transition pipeline.

### Why only light mode?

Browsers already disable subpixel AA for light-on-dark text, so there's no visible difference when GPU layers are promoted in dark mode. Thumbnail flicker from compositing churn is technically mode-independent but less perceptible on dark backgrounds.

## Fix

### Text shimmer

1. Added `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale` globally in `index.css` — forces consistent grayscale AA so GPU layer promotion never changes text appearance.
2. Removed the redundant `group-hover:text-[#073642]` from the title `<span>`.

### Thumbnail flicker

3. Removed **all** CSS transitions from BookTile — the `<Link>` wrapper, star button overlay, and tag overlay. Hover effects (background change, overlay show/hide) are now instant. This eliminates all GPU layer promotion/demotion during hover, preventing re-compositing of the thumbnail.
4. Wrapped `PdfThumbnail` in `memo` with a comparator on `file`, `fullPath`, and `cacheKey` (ignoring `onTotalPages`, which is an unstable inline arrow function from BookTile but is only consumed in a one-shot effect). Prevents unnecessary re-renders from reaching the thumbnail even if BookTile re-renders.

## General lessons

- Always set `-webkit-font-smoothing: antialiased` globally to prevent subpixel/grayscale AA mode switches.
- Avoid CSS transitions on container elements that hold images or canvases — even scoped transitions (`transition-colors`, `transition-opacity`) trigger GPU layer promotion, which forces re-compositing of all children in the stacking context.
- Instant hover effects (no transition) are often visually fine and eliminate entire categories of compositing bugs.
- Memo components that hold expensive cached state (IndexedDB lookups, data URLs) to guard against unnecessary re-renders.
