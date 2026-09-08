import { useMemo } from 'react'
import { highlightSource } from '../../lib/highlight'

const TYPE = 'py-3 pr-4 font-mono text-[12px] leading-5 whitespace-pre-wrap break-all [tab-size:2]'

export function CodeEditor({
  path,
  value,
  onChange,
  className = '',
}: {
  path: string
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const colored = useMemo(() => highlightSource(value, path), [value, path])
  return (
    <div className={`relative min-h-full min-w-0 flex-1 ${className}`}>
      <pre
        aria-hidden
        className={`pointer-events-none relative z-0 m-0 min-h-full bg-transparent text-[#e6edf3] ${TYPE}`}
      >
        {colored || ' '}
      </pre>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        wrap="soft"
        className={`absolute inset-0 z-10 h-full w-full resize-none overflow-hidden bg-transparent text-transparent caret-[#f54e00] outline-none selection:bg-[#f54e00]/30 selection:text-transparent ${TYPE}`}
      />
    </div>
  )
}
