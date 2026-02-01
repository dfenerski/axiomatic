# Axiomatic

A local-first PDF textbook reader with vim-style navigation, per-page LaTeX notes, and a solarized theme. Built for students and researchers who prefer keyboard-driven workflows.

## Features

- **PDF reading** with text search, zoom (50%--300%), and automatic progress tracking
- **Per-page notes** in a split-pane Markdown editor with full vim keybindings
- **LaTeX math** rendering inline (`$E=mc^2$`) and in display blocks (`$$\sum x^2$$`)
- **Image paste** directly into notes from clipboard
- **Library management** -- scan directories for PDFs, star favourites, sort by last read
- **Keyboard navigation** everywhere: `j/k` scrolling in the reader, `h/j/k/l` grid navigation in the library, `Ctrl+L` to open notes, `Ctrl+H` to close
- **Solarized light & dark** themes with automatic OS detection
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

## Roadmap

- highlight pdf content - `sioyek`, but better
- bookmark pdf page / paragraph - `sioyek`, but better
- pdf overview as in `evince`
- more vim nav keybinds:nav back from reader to overview with ctrl-h
- live-watch for OS changes
- better app icon, naming in system tray when exported
- ability to create a parallel hierarchical structure to organize the files
- export
    - notes: copy, export, print
    - valut: export/import
    - print pdfs together with notes? 
- drag docs into app starts tracking them


## License

MIT


