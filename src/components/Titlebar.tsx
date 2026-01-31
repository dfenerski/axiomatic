import { getCurrentWindow } from '@tauri-apps/api/window'

const appWindow = getCurrentWindow()

export function Titlebar() {
  return (
    <div
      onMouseDown={(e) => {
        // Only drag on the bar itself, not on buttons
        if ((e.target as HTMLElement).closest('button')) return
        e.preventDefault()
        appWindow.startDragging()
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        appWindow.toggleMaximize()
      }}
      className="flex h-9 shrink-0 select-none items-center justify-between border-b border-[#eee8d5] bg-[#fdf6e3] px-3 dark:border-[#073642] dark:bg-[#002b36]"
    >
      <div className="flex items-center gap-2 pointer-events-none">
        <img src="/axiomatic.png" alt="" className="h-4 w-4" />
        <span className="text-xs font-semibold text-[#586e75] dark:text-[#93a1a1]">
          Axiomatic
        </span>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => appWindow.minimize()}
          className="rounded p-1 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
          aria-label="Minimize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="2" y="5.5" width="8" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          className="rounded p-1 text-[#657b83] hover:bg-[#eee8d5] dark:text-[#93a1a1] dark:hover:bg-[#073642]"
          aria-label="Maximize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          onClick={() => appWindow.close()}
          className="rounded p-1 text-[#657b83] hover:bg-red-500 hover:text-white dark:text-[#93a1a1] dark:hover:bg-red-500 dark:hover:text-[#eee8d5]"
          aria-label="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
