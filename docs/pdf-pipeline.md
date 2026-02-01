# PDF rendering pipeline

Two separate pipelines: **thumbnails** (OverviewPage) and **full viewer** (ReaderPage).

## Thumbnail pipeline

Renders page 1 of each PDF as a 200px-wide JPEG, cached in IndexedDB.

### Flow diagram

```
BookTile
  └── PdfThumbnail(file=assetUrl, fullPath, cacheKey=slug)

             ┌─ not in viewport ──→ render sentinel div (lightweight)
             │
  visible? ──┤
             │
             └─ in viewport (IntersectionObserver, 200px margin)
                     │
                     ▼
              check IndexedDB cache (getCachedThumbnail)
                     │
           ┌─ hit ──┤
           │        └─ miss
           │             │
           ▼             ▼
      render <img>   enqueue() — acquire queue slot
      from dataUrl       │
                         ▼
                  ┌── slot acquired (MAX_CONCURRENT=2) ──┐
                  │                                       │
                  │  setReady(true)                        │
                  │  mount <Document file={assetUrl}>      │
                  │  pdfjs worker fetches via asset URL    │
                  │  <Page pageNumber={1} width={200}>     │
                  │       │                                │
                  │       ▼                                │
                  │  onRenderSuccess:                      │
                  │    canvas.toDataURL('image/jpeg',0.8)  │
                  │    setCachedThumbnail(slug, jpeg)       │
                  │    releaseSlot() ──→ next queued item  │
                  │                                        │
                  │  onRenderError / onLoadError:           │
                  │    releaseSlot()                        │
                  │                                        │
                  │  component unmounts:                    │
                  │    cleanup releases slot if held        │
                  └────────────────────────────────────────┘
```

### Key files

| File | Role |
|------|------|
| `components/PdfThumbnail.tsx` | Component: visibility detection, cache check, queue integration, Document/Page mount |
| `lib/load-queue.ts` | Concurrency limiter: MAX_CONCURRENT=2, microtask-debounced progress notifications |
| `lib/thumbnail-cache.ts` | IndexedDB wrapper: get/set/delete cached {dataUrl, totalPages} |
| `hooks/useSyncStatus.ts` | Derives sync phase (scanning/rendering/loading/done) from queue idle state |
| `components/SyncStatus.tsx` | Progress bar UI, subscribes to queue progress directly |

### Why not readFile?

The previous implementation used `readFile(fullPath)` from `@tauri-apps/plugin-fs` to read
the entire PDF into a `Uint8Array`, then passed it to `<Document file={{data: bytes}}>`.

This caused scroll freezes because:
1. `readFile` transfers the entire file (50MB+ for math textbooks) over Tauri IPC
2. The `Uint8Array` is deserialized **on the JS main thread**
3. With MAX_CONCURRENT=3, that was 150MB+ of main-thread deserialization

The fix: pass the `convertFileSrc(fullPath)` URL directly to `<Document file={url}>`.
pdfjs-dist's **web worker** fetches the file from Tauri's asset protocol, keeping all
heavy binary I/O off the main thread.

### Load queue design

```
enqueue(fn) → fn() returns a Promise
  - slot acquired immediately if running < MAX_CONCURRENT
  - otherwise pushed to FIFO queue
  - slot released when the Promise resolves/rejects
  - .finally() dequeues next item

For thumbnails, fn() wraps the ENTIRE lifecycle:
  fn = () => new Promise(resolve => {
    resolveRender.current = resolve   // held until Page renders
    setReady(true)                    // triggers Document mount
  })
```

The queue slot is held from the moment rendering starts until `onRenderSuccess` or
`onRenderError` fires. This means at most MAX_CONCURRENT PDFs are being parsed by
pdfjs-dist at any given time — not just file reads, but the full parse→render cycle.

### Progress notifications

`load-queue.ts` tracks `totalEnqueued` and `totalCompleted` counters. `notify()` uses
`queueMicrotask` with a `pendingNotify` flag to coalesce multiple enqueue/complete events
within the same event loop tick into a single listener callback. Counters reset to 0
when idle.

`useSyncStatus` subscribes to the queue but only stores the `idle` boolean (not progress
fraction) to avoid re-rendering OverviewPage on every completion. `SyncStatus` subscribes
separately for the progress fraction — it's a tiny component so frequent re-renders are
cheap.

### Thumbnail cache

IndexedDB database `axiomatic`, object store `thumbnails`, version 2.

Each entry: `{ dataUrl: string (JPEG base64), totalPages: number }`, keyed by slug.

Version bumps drop and recreate the store (cache bust). Entries with `dataUrl.length < 200`
are treated as corrupt and purged on read.

---

## Full PDF viewer pipeline

Used by `ReaderPage` → `PdfViewer` component.

### Virtual scrolling

PdfViewer renders only visible pages plus a buffer of 5 pages above and below.
Page visibility is calculated from scroll position and cumulative page heights.
A `requestAnimationFrame`-debounced scroll handler updates the visible range.

```
scroll container (overflow-y: auto)
  └── spacer div (total height of all pages)
      └── absolutely positioned <Page> components (only for visible range)
```

### Search

`useSearch` extracts text from all pages (cached), performs case-insensitive matching,
returns `SearchMatch[]` with page/charStart/charEnd. PdfViewer uses the CSS Custom
Highlight API (`::highlight`) to render match highlights without modifying the DOM.

### Zoom

8 predefined steps: 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0. Zoom changes maintain
scroll position ratio. Page width = container width * zoom.

### Dark mode

PDF canvases are inverted + hue-rotated in dark mode via CSS filter:
`filter: invert(1) hue-rotate(180deg)`. This preserves color diagrams while making
white backgrounds dark.

### pdfjs configuration

Worker configured in `main.tsx`:
```ts
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()
```

CMap and standard font files copied to dist/ by `vite-plugin-static-copy` in `vite.config.ts`.
