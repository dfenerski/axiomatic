import type { Command } from '../components/CommandPalette'
import { setTheme } from '../hooks/useTheme'

export function buildCommands(isReader: boolean, theme: string): Command[] {
  const cmds: Command[] = [
    {
      id: 'theme-system',
      label: 'Use OS theme',
      action: () => setTheme('system'),
    },
    {
      id: 'theme-toggle',
      label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
      action: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    },
  ]

  if (isReader) {
    cmds.push(
      {
        id: 'toggle-outline',
        label: 'Toggle outline',
        shortcut: 'Ctrl+B',
        action: () => window.dispatchEvent(new CustomEvent('axiomatic:toggle-outline')),
      },
      {
        id: 'toggle-notes',
        label: 'Toggle notes',
        shortcut: 'Ctrl+L',
        action: () => window.dispatchEvent(new CustomEvent('axiomatic:toggle-notes')),
      },
      {
        id: 'toggle-bookmarks',
        label: 'Toggle bookmarks',
        action: () => window.dispatchEvent(new CustomEvent('axiomatic:toggle-bookmarks')),
      },
      {
        id: 'toggle-highlights',
        label: 'Toggle highlights',
        action: () => window.dispatchEvent(new CustomEvent('axiomatic:toggle-highlights')),
      },
      {
        id: 'toggle-zen',
        label: 'Toggle zen mode',
        action: () => window.dispatchEvent(new CustomEvent('axiomatic:toggle-zen')),
      },
      {
        id: 'toggle-learning-tools',
        label: 'Toggle learning tools',
        action: () => window.dispatchEvent(new CustomEvent('axiomatic:toggle-learning-tools')),
      },
    )
  }

  return cmds
}
