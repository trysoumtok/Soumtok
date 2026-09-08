import { useEffect, useMemo, useRef, useState } from 'react'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d={dir === 'left' ? 'M8.4 3.2 4.6 7l3.8 3.8' : 'M5.6 3.2 9.4 7l-3.8 3.8'}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="6.2" cy="6.2" r="4.1" stroke="currentColor" strokeWidth="1.3" />
      <path d="m9.2 9.2 2.4 2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

const menu =
  'absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-white/[0.08] bg-[#141413] shadow-[0_16px_40px_rgba(0,0,0,0.45)]'
const listScroll =
  'max-h-[220px] overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.18)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/18 [&::-webkit-scrollbar-track]:bg-transparent'

export function SearchSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  searchable = true,
  disabled = false,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  placeholder: string
  searchable?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((item) => item.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      window.setTimeout(() => searchRef.current?.focus(), 20)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((next) => !next)
        }}
        className={`flex w-full items-center justify-between rounded-md border border-white/[0.08] bg-[#0c0c0b] px-3 py-2.5 text-left text-[14px] outline-none ${
          disabled ? 'cursor-not-allowed opacity-45' : 'hover:border-white/16 focus:border-white/22'
        }`}
      >
        <span className={value ? 'text-white' : 'text-white/28'}>{value || placeholder}</span>
        <span className={`text-white/30 transition ${open ? '-rotate-90' : 'rotate-90'}`}>
          <Chevron dir="right" />
        </span>
      </button>
      {open && (
        <div className={menu}>
          {searchable && (
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5 text-white/35">
              <SearchIcon />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="w-full bg-transparent text-[13px] text-white outline-none placeholder:text-white/28"
              />
            </div>
          )}
          <div className={listScroll}>
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-[13px] text-white/35">No matches</p>
            )}
            {filtered.map((item) => {
              const active = item === value
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    onChange(item)
                    setOpen(false)
                  }}
                  className={`block w-full px-3 py-2 text-left text-[13.5px] ${
                    active ? 'bg-[#f54e00]/16 text-white' : 'text-white/80 hover:bg-white/[0.05]'
                  }`}
                >
                  {item}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function formatDate(value: string) {
  const date = parseDate(value)
  if (!date) return ''
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

function toValue(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function BirthCalendar({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  const selected = parseDate(value)
  const today = new Date()
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState<'day' | 'month' | 'year'>('day')
  const [view, setView] = useState(() => selected || new Date(today.getFullYear() - 20, 0, 1))
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 320 })

  function place() {
    const box = wrapRef.current?.getBoundingClientRect()
    if (!box) return
    const width = Math.max(box.width, 300)
    const left = Math.min(box.left, window.innerWidth - width - 12)
    const below = box.bottom + 8
    const estimated = 340
    const top = below + estimated > window.innerHeight - 16 ? Math.max(16, box.top - estimated - 8) : below
    setPos({ top, left, width })
  }

  useEffect(() => {
    if (!open) return
    place()
    function onDoc(event: MouseEvent) {
      const target = event.target as Node
      if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
      setPick('day')
    }
    window.addEventListener('pointerdown', onDoc)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('pointerdown', onDoc)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  const year = view.getFullYear()
  const month = view.getMonth()
  const start = new Date(year, month, 1)
  const startPad = (start.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array.from({ length: startPad + daysInMonth }, (_, i) => (i < startPad ? 0 : i - startPad + 1))
  const years = Array.from({ length: 90 }, (_, i) => today.getFullYear() - 12 - i)

  return (
    <div ref={wrapRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => {
          setPick('day')
          setOpen((next) => !next)
        }}
        className="flex w-full items-center justify-between rounded-md border border-white/[0.08] bg-[#0c0c0b] px-3 py-2.5 text-left text-[14px] outline-none hover:border-white/16 focus:border-white/22"
      >
        <span className={value ? 'text-white' : 'text-white/28'}>
          {value ? formatDate(value) : 'Pick your birthday'}
        </span>
        <span className="text-white/30">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <rect x="1.8" y="2.6" width="10.4" height="9.6" rx="1.6" stroke="currentColor" strokeWidth="1.3" />
            <path d="M1.8 5.4h10.4M4.4 1.7v2M9.6 1.7v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </span>
      </button>
      {open && (
        <div
          ref={panelRef}
          className="fixed z-[80] rounded-xl border border-white/[0.08] bg-[#141413] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPick((current) => (current === 'month' ? 'day' : 'month'))}
              className={`rounded-md border px-3 py-2 text-left text-[13px] ${
                pick === 'month' ? 'border-[#f54e00]/70 bg-[#f54e00]/12 text-white' : 'border-white/[0.08] text-white/80'
              }`}
            >
              <span className="block text-[10px] text-white/35">Month</span>
              {MONTHS[month]}
            </button>
            <button
              type="button"
              onClick={() => setPick((current) => (current === 'year' ? 'day' : 'year'))}
              className={`rounded-md border px-3 py-2 text-left text-[13px] ${
                pick === 'year' ? 'border-[#f54e00]/70 bg-[#f54e00]/12 text-white' : 'border-white/[0.08] text-white/80'
              }`}
            >
              <span className="block text-[10px] text-white/35">Year</span>
              {year}
            </button>
          </div>

          {pick === 'month' && (
            <div className="grid grid-cols-3 gap-1">
              {MONTHS.map((name, index) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setView(new Date(year, index, 1))
                    setPick('day')
                  }}
                  className={`rounded-md py-2 text-[12.5px] ${
                    index === month ? 'bg-[#f54e00] text-black' : 'text-white/75 hover:bg-white/5'
                  }`}
                >
                  {name.slice(0, 3)}
                </button>
              ))}
            </div>
          )}

          {pick === 'year' && (
            <div className={`${listScroll} grid max-h-[240px] grid-cols-3 gap-1`}>
              {years.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setView(new Date(item, month, 1))
                    setPick('day')
                  }}
                  className={`rounded-md py-1.5 text-[13px] ${
                    item === year ? 'bg-[#f54e00] text-black' : 'text-white/70 hover:bg-white/5'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          )}

          {pick === 'day' && (
            <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] text-white/30">
              {WEEK.map((day) => (
                <span key={day} className="py-1">
                  {day}
                </span>
              ))}
              {cells.map((day, i) => {
                if (!day) return <span key={`e-${i}`} />
                const date = new Date(year, month, day)
                const future = date > today
                const isSelected =
                  selected &&
                  selected.getFullYear() === year &&
                  selected.getMonth() === month &&
                  selected.getDate() === day
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={future}
                    onClick={() => {
                      onChange(toValue(year, month, day))
                      setOpen(false)
                      setPick('day')
                    }}
                    className={`mx-auto grid h-8 w-8 place-items-center rounded-full text-[13px] ${
                      isSelected
                        ? 'bg-[#f54e00] text-black'
                        : future
                          ? 'text-white/15'
                          : 'text-white/75 hover:bg-white/8'
                    }`}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
