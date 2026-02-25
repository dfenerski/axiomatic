# Axiomatic

A local-first PDF textbook reader with vim-style navigation, per-page LaTeX notes, and a solarized theme. Built for students and researchers who prefer keyboard-driven workflows.

## Features

- **PDF reading** with text search, zoom (50%--300%), and automatic progress tracking
- **Per-page notes** in a split-pane Markdown editor with full vim keybindings
- **LaTeX math** rendering inline (`$E=mc^2$`) and in display blocks (`$$\sum x^2$$`)
- **Image paste** directly into notes from clipboard
- **Library management** -- scan directories for PDFs, star favourites, sort by last read
- **Command palette** (`Ctrl+P`) -- fuzzy-search commands for panel toggles, theme switching, and zen mode
- **Zen mode** -- hide all chrome for distraction-free reading; notes still openable
- **Keyboard navigation** everywhere: `j/k` scrolling in the reader, `h/j/k/l` grid navigation in the library, `Ctrl+L` to open notes, `Ctrl+H` to close
- **Solarized light & dark** themes with automatic OS detection, switchable via command palette
- **Local storage** -- all notes and images live in a SQLite database on your machine

## Install

Download the latest `.deb`, `.rpm`, or `.AppImage` from [Releases](../../releases).

## Build from source

Requires Node.js 20+, Rust 1.77+, and the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run build
```

The bundled app will be in `src-tauri/target/release/bundle/`.

## Development

```sh
npm run dev
```

## Changelog

### 0.0.6 (unreleased)

- **Snip mode** — select rectangular regions on PDF pages and label them as flashcards (`Ctrl+P` → Snip)
- **Loop review** — carousel page (`/loop/:slug`) to study snips with reveal, prev/next (j/k), and XP tracking; sorted or shuffled modes via command palette
- **Snip overlay** — drag-to-select crosshair with visual feedback; label banner with auto-focus
- **Snip persistence** — new `snips` SQLite table with full CRUD (Rust backend)
- **Highlight commands extraction** — moved highlight CRUD from `commands.rs` into dedicated `highlight_commands.rs` module
- **Route-aware tabs** — tabs now store their route, enabling non-reader tabs (e.g. loop); new `useTabNavigation` hook deduplicates tab navigation logic
- **Reader state bridge** — module-level store (`readerState.ts`) lets the command palette react to reader state (snip mode, has snips) without prop drilling
- **Large screen grid** — library grid scales to 8 columns at 2xl and 10 columns at 1920px+
- **Vim overview fix** — column count now read from the actual CSS grid (`getComputedStyle`) instead of duplicated breakpoint logic

## Roadmap


- [ ] projects
    - [x] auto-snipper + review section with multiple modes
    - [ ] list view on snips
    - [ ] taggable, searchable, latex-able snips
    - [ ] lists as first-class objects, collectable, persistent
    - [ ] ~~projects concept, see "ability to create..."~~ Attached directories got promoted to projects
    - [ ] whats the project persistency status (`.axiomatic` dir is missing from attached directories / projects)

- [ ] ddd adoption / language-building capabilities (PDE - platform development environment)
    - [ ] DSL generator
    - [ ] concept lifter
- [ ] web / ios / android / windows build targets
- [ ] live-watch for OS changes
- [ ] ability to create a parallel hierarchical structure to organize the files, see "projects concept"
- [ ] export
    - [ ] notes: copy, export, print
    - [ ] valut: export/import
    - [ ] print pdfs together with notes? 
- [ ] drag docs into app starts tracking them



## License

MIT


