import { useCallback, useEffect, useRef, useState } from 'react'

interface SnipBannerProps {
  onSave: (label: string) => void
  onCancel: () => void
}

export function SnipBanner({ onSave, onCancel }: SnipBannerProps) {
  const [label, setLabel] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = useCallback(() => {
    if (label.trim()) onSave(label.trim())
  }, [label, onSave])

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-[#eee8d5] bg-[#eee8d5]/60 px-4 py-2 dark:border-[#073642] dark:bg-[#073642]/60">
      <span className="text-sm text-[#657b83] dark:text-[#93a1a1]">Label:</span>
      <input
        ref={inputRef}
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit()
          if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
        }}
        placeholder="e.g. Chain rule formula"
        className="min-w-0 flex-1 rounded border border-[#93a1a1]/30 bg-[#fdf6e3] px-2 py-1 text-sm text-[#657b83] placeholder-[#93a1a1] outline-none focus:border-[#268bd2] dark:bg-[#002b36] dark:text-[#93a1a1] dark:placeholder-[#586e75]"
      />
      <button
        onClick={handleSubmit}
        disabled={!label.trim()}
        className="shrink-0 rounded bg-[#268bd2] px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        className="shrink-0 text-xs text-[#93a1a1] hover:text-[#657b83] dark:text-[#586e75] dark:hover:text-[#93a1a1]"
      >
        Cancel
      </button>
    </div>
  )
}
