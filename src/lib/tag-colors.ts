export const TAG_PALETTE = [
  '#dc322f', '#cb4b16', '#b58900', '#859900', '#2aa198',
  '#268bd2', '#6c71c4', '#d33682', '#c97a2c', '#5e8c61',
] as const

export function defaultTagColor(index: number): string {
  return TAG_PALETTE[index % TAG_PALETTE.length]
}
