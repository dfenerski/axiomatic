interface Props {
  isLongBreak: boolean
  breakMinutes: number
  onDismiss: () => void
}

export function BreakOverlay({ isLongBreak, breakMinutes, onDismiss }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#002b36]/80 dark:bg-[#002b36]/90">
      <div className="flex flex-col items-center gap-6 rounded-2xl bg-[#fdf6e3] px-12 py-10 shadow-2xl dark:bg-[#073642]">
        <div className="text-4xl text-[#268bd2]">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
            <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
            <line x1="6" y1="2" x2="6" y2="4" />
            <line x1="10" y1="2" x2="10" y2="4" />
            <line x1="14" y1="2" x2="14" y2="4" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-[#586e75] dark:text-[#93a1a1]">
          {isLongBreak ? 'Long break' : 'Take a break'}
        </h2>
        <p className="text-sm text-[#657b83] dark:text-[#839496]">
          {breakMinutes} minute{breakMinutes !== 1 ? 's' : ''} {isLongBreak ? 'long break' : 'break'} starting now
        </p>
        <button
          onClick={onDismiss}
          className="rounded-lg bg-[#268bd2] px-6 py-2 text-sm font-medium text-white hover:bg-[#268bd2]/90 focus:outline-none focus:ring-2 focus:ring-[#268bd2] focus:ring-offset-2 dark:focus:ring-offset-[#073642]"
          autoFocus
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
