// Module-level callback for toolbar buttons to toggle the command palette.
// Layout registers its setter on mount; consumers call togglePalette().
let _toggle: (() => void) | null = null

export function registerPaletteToggle(fn: () => void): () => void {
  _toggle = fn
  return () => { _toggle = null }
}

export function togglePalette() {
  _toggle?.()
}
