import { Link, useLocation } from 'react-router-dom'

interface Props {
  collapsed: boolean
  zenMode: boolean
  onToggleCollapse?: () => void
}

const navItems = [
  {
    label: 'Projects',
    to: '/',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    label: 'Snips',
    to: '/snips',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <line x1="20" y1="4" x2="8.12" y2="15.88" />
        <line x1="14.47" y1="14.48" x2="20" y2="20" />
        <line x1="8.12" y1="8.12" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    label: 'Stats',
    to: '/stats',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
]

export function Sidebar({ collapsed, zenMode, onToggleCollapse }: Props) {
  const location = useLocation()

  if (zenMode) return null

  return (
    <nav
      className="flex shrink-0 flex-col border-r border-[#eee8d5] bg-[#fdf6e3] py-2 dark:border-[#073642] dark:bg-[#002b36]"
      style={{ width: collapsed ? 40 : 160 }}
    >
      {navItems.map((item) => {
        const active = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to))
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
              active
                ? 'text-[#268bd2]'
                : 'text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]'
            }`}
          >
            <span className="shrink-0">{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </Link>
        )
      })}
      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className="mt-auto flex items-center gap-2 px-3 py-1.5 text-sm text-[#657b83] transition-colors hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
        >
          <span className="shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {collapsed ? (
                <polyline points="9 18 15 12 9 6" />
              ) : (
                <polyline points="15 18 9 12 15 6" />
              )}
            </svg>
          </span>
          {!collapsed && <span>{collapsed ? 'Expand' : 'Collapse'}</span>}
        </button>
      )}
    </nav>
  )
}
