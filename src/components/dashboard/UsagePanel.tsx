import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchAnalytics } from '../../lib/api'
import { useSession } from '../../lib/auth-client'
import { navigate, openTab } from '../../lib/nav'
import { buildUsageCsv, usageCsvFilename, type UsageCsvRow, type UsageCsvUsage } from '../../lib/usage-csv'
import { usageRowCostUsd, usageRowKind } from '../../../shared/imageBilling.ts'
import { catalogModelId, usageModelLabel } from '../../../shared/models.ts'

type Preset = '1d' | '7d' | '30d' | 'mtd' | 'last' | 'custom'
type SeriesPoint = { day: string; model: string; tokens: number }
type UsageRow = UsageCsvRow

const MODEL_COLORS = ['#3dd68c', '#3b6cff', '#9aa7ff', '#c084fc', '#f472b6', '#fbbf24', '#22d3ee', '#fb923c']
const ON_DEMAND_PER_M = 2

function startOfUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86400000)
}

function rangeFor(preset: Exclude<Preset, 'custom'>, now = new Date()) {
  const today = startOfUtc(now)
  const tomorrow = addDays(today, 1)
  if (preset === '1d') return { from: today, to: tomorrow }
  if (preset === '7d') return { from: addDays(today, -6), to: tomorrow }
  if (preset === '30d') return { from: addDays(today, -29), to: tomorrow }
  if (preset === 'mtd') return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to: tomorrow }
  const firstThis = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)), to: firstThis }
}

function formatRange(from: Date, to: Date) {
  const end = addDays(to, -1)
  const a = from.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
  const b = end.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
  return `${a} - ${b}`
}

function localTimeZoneLabel() {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date())
    return parts.find((part) => part.type === 'timeZoneName')?.value || 'local'
  } catch {
    return 'local'
  }
}

function formatUsageWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function rangeIncludesNow(from: Date, to: Date) {
  const now = Date.now()
  return from.getTime() <= now && to.getTime() > now
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 1)}M`.replace(/\.0M$/, 'M')
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`.replace(/\.0K$/, 'K')
  return String(Math.round(n))
}

function daysInRange(from: Date, to: Date) {
  const days: string[] = []
  for (let cursor = startOfUtc(from); cursor < to; cursor = addDays(cursor, 1)) {
    days.push(cursor.toISOString().slice(0, 10))
  }
  return days
}

function colorFor(model: string, models: string[]) {
  return MODEL_COLORS[Math.max(0, models.indexOf(model)) % MODEL_COLORS.length]
}

function UsageChart({
  days,
  models,
  byDay,
}: {
  days: string[]
  models: string[]
  byDay: Record<string, Record<string, number>>
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [width, setWidth] = useState(720)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const sync = () => setWidth(Math.max(480, el.clientWidth))
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const height = 280
  const pad = { l: 56, r: 18, t: 18, b: 36 }
  const innerW = width - pad.l - pad.r
  const innerH = height - pad.t - pad.b
  const today = startOfUtc(new Date()).toISOString().slice(0, 10)

  const running: Record<string, number> = Object.fromEntries(models.map((model) => [model, 0]))
  const cumulative = days.map((day) => {
    for (const model of models) running[model] += byDay[day]?.[model] || 0
    let y = 0
    const layers = models.map((model) => {
      const next = y + running[model]
      const layer = { model, y0: y, y1: next }
      y = next
      return layer
    })
    return { day, total: y, layers, cumulative: y }
  })

  const max = Math.max(1, ...cumulative.map((row) => row.cumulative))
  const x = (i: number) => pad.l + (days.length <= 1 ? innerW / 2 : (i / (days.length - 1)) * innerW)
  const y = (v: number) => pad.t + (1 - v / max) * innerH

  function area(model: string) {
    if (days.length === 0) return ''
    const top = cumulative.map((row, i) => {
      const layer = row.layers.find((item) => item.model === model)
      return `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(layer?.y1 || row.cumulative - row.total)}`
    })
    const bottom = [...cumulative].reverse().map((row, i) => {
      const layer = row.layers.find((item) => item.model === model)
      const idx = days.length - 1 - i
      return `L ${x(idx)} ${y(layer?.y0 || 0)}`
    })
    return `${top.join(' ')} ${bottom.join(' ')} Z`
  }

  const ticks = [0, max / 2, max]
  const todayIndex = days.indexOf(today)
  const active = hover

  return (
    <div ref={wrapRef} className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[280px] w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          const px = ((event.clientX - box.left) / box.width) * width
          let nearest = 0
          let best = Infinity
          days.forEach((_, i) => {
            const d = Math.abs(x(i) - px)
            if (d < best) {
              best = d
              nearest = i
            }
          })
          setHover(nearest)
        }}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={width - pad.r} y1={y(tick)} y2={y(tick)} stroke="rgba(255,255,255,0.06)" />
            <text x={pad.l - 8} y={y(tick) + 4} textAnchor="end" fill="rgba(255,255,255,0.35)" fontSize="11">
              {formatTokens(tick)}
            </text>
          </g>
        ))}
        <text x="12" y={pad.t + innerH / 2} fill="rgba(255,255,255,0.28)" fontSize="11" transform={`rotate(-90 12 ${pad.t + innerH / 2})`}>
          Cumulative Tokens
        </text>
        {models.map((model) => (
          <path key={model} d={area(model)} fill={colorFor(model, models)} fillOpacity="0.55" />
        ))}
        {days.length > 1 && models.length === 0 && (
          <line x1={pad.l} x2={width - pad.r} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.2)" />
        )}
        {todayIndex >= 0 && (
          <line
            x1={x(todayIndex)}
            x2={x(todayIndex)}
            y1={pad.t}
            y2={height - pad.b}
            stroke="rgba(255,255,255,0.35)"
            strokeDasharray="4 4"
          />
        )}
        {active !== null && days[active] && (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={pad.t}
            y2={height - pad.b}
            stroke="rgba(255,255,255,0.25)"
          />
        )}
        {days.map((day, i) =>
          i === 0 || i === days.length - 1 || i === Math.floor((days.length - 1) / 2) ? (
            <text key={day} x={x(i)} y={height - 10} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="11">
              {new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
            </text>
          ) : null,
        )}
      </svg>
      {active !== null && days[active] && (
        <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-md border border-white/10 bg-[#141413] px-3 py-2 text-[12px] text-white/80">
          <p className="text-white/50">
            {new Date(`${days[active]}T00:00:00Z`).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              timeZone: 'UTC',
            })}{' '}
            Daily breakdown
          </p>
          {models.length === 0 ? (
            <p className="mt-1 text-white/40">No data</p>
          ) : (
            models.map((model) => (
              <p key={model} className="mt-0.5">
                <span className="mr-2 inline-block h-1.5 w-3 rounded-sm" style={{ background: colorFor(model, models) }} />
                {model} · {formatTokens(byDay[days[active]]?.[model] || 0)}
              </p>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function Calendar({
  from,
  to,
  onCancel,
  onApply,
}: {
  from: Date
  to: Date
  onCancel: () => void
  onApply: (from: Date, to: Date) => void
}) {
  const inclusiveEnd = addDays(to, -1)
  const [view, setView] = useState(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)))
  const [start, setStart] = useState(startOfUtc(from))
  const [end, setEnd] = useState(startOfUtc(inclusiveEnd))
  const [picking, setPicking] = useState<'start' | 'end'>('end')

  const year = view.getUTCFullYear()
  const month = view.getUTCMonth()
  const first = new Date(Date.UTC(year, month, 1))
  const lead = first.getUTCDay()
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells = Array.from({ length: lead + days }, (_, i) => (i < lead ? null : i - lead + 1))

  function pick(day: number) {
    const next = new Date(Date.UTC(year, month, day))
    if (picking === 'start' || next < start) {
      setStart(next)
      setEnd(next)
      setPicking('end')
      return
    }
    setEnd(next)
    setPicking('start')
  }

  function inRange(day: number) {
    const date = new Date(Date.UTC(year, month, day)).getTime()
    const a = Math.min(start.getTime(), end.getTime())
    const b = Math.max(start.getTime(), end.getTime())
    return date >= a && date <= b
  }

  function isStart(day: number) {
    const date = new Date(Date.UTC(year, month, day)).getTime()
    return date === Math.min(start.getTime(), end.getTime())
  }

  return (
    <div className="absolute left-0 top-full z-30 mt-2 w-[320px] rounded-xl border border-white/10 bg-[#141413] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className="grid h-7 w-7 place-items-center text-white/50 hover:text-white" onClick={() => setView(new Date(Date.UTC(year, month - 1, 1)))}>
          ‹
        </button>
        <p className="text-[13px] text-white/80">
          {view.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
          <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/45">UTC</span>
        </p>
        <button type="button" className="grid h-7 w-7 place-items-center text-white/50 hover:text-white" onClick={() => setView(new Date(Date.UTC(year, month + 1, 1)))}>
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] text-white/30">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-1">
        {cells.map((day, i) =>
          day ? (
            <button
              key={i}
              type="button"
              onClick={() => pick(day)}
              className={`h-8 text-[13px] ${
                isStart(day)
                  ? 'rounded-md bg-[#7dd3fc] text-black'
                  : inRange(day)
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/70 hover:bg-white/[0.05]'
              }`}
            >
              {day}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-white/15 px-3 py-1.5 text-[12px] text-white/70">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            const a = start <= end ? start : end
            const b = start <= end ? end : start
            onApply(a, addDays(b, 1))
          }}
          className="rounded-md border border-white/15 px-3 py-1.5 text-[12px] text-white"
        >
          Apply
        </button>
      </div>
    </div>
  )
}

export function UsagePanel() {
  const { data: session } = useSession()
  const [preset, setPreset] = useState<Preset>('7d')
  const [from, setFrom] = useState(() => rangeFor('7d').from)
  const [to, setTo] = useState(() => rangeFor('7d').to)
  const [calendar, setCalendar] = useState(false)
  const [series, setSeries] = useState<SeriesPoint[]>([])
  const [usage, setUsage] = useState<UsageCsvUsage[]>([])
  const [rows, setRows] = useState<UsageRow[]>([])
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const rangeRef = useRef<HTMLDivElement>(null)
  const tzLabel = useMemo(() => localTimeZoneLabel(), [])

  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetchAnalytics({ from: from.toISOString(), to: to.toISOString() })
        .then((data) => {
          if (cancelled) return
          setSeries(data.series || [])
          setUsage(data.usage || [])
          setRows(data.rows || [])
          setLastSyncedAt(Date.now())
        })
        .catch(() => {
          if (cancelled) return
          setSeries([])
          setUsage([])
          setRows([])
        })

    void load()
    if (!rangeIncludesNow(from, to)) return () => { cancelled = true }

    const pollMs = preset === '1d' ? 5000 : 10000
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      void load()
    }, pollMs)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [from, to, preset])

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!rangeRef.current?.contains(event.target as Node)) setCalendar(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const days = useMemo(() => daysInRange(from, to), [from, to])
  const models = useMemo(() => {
    const seen: string[] = []
    for (const row of series) {
      const label = usageModelLabel(row.model)
      if (!seen.includes(label)) seen.push(label)
    }
    return seen
  }, [series])
  const byDay = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    for (const day of days) map[day] = {}
    for (const row of series) {
      if (!map[row.day]) map[row.day] = {}
      const label = usageModelLabel(row.model)
      map[row.day][label] = (map[row.day][label] || 0) + row.tokens
    }
    return map
  }, [days, series])

  const included = rows.filter((row) => row.billed_to !== 'user').reduce((sum, row) => sum + (row.tokens || 0), 0)
  const byok = rows.filter((row) => row.billed_to === 'user').reduce((sum, row) => sum + (row.tokens || 0), 0)
  const total = included + byok

  function applyPreset(next: Exclude<Preset, 'custom'>) {
    const range = rangeFor(next)
    setPreset(next)
    setFrom(range.from)
    setTo(range.to)
    setCalendar(false)
  }

  function exportCsv() {
    const csv = buildUsageCsv({
      account: session?.user.email || session?.user.name || '',
      from,
      to,
      rows,
      usage,
    })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = usageCsvFilename(from, to)
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2" ref={rangeRef}>
        <div className="relative">
          <button
            type="button"
            onClick={() => setCalendar((open) => !open)}
            className="inline-flex items-center gap-2 rounded-md border border-white/12 px-3 py-1.5 text-[13px] text-white/80"
          >
            {formatRange(from, to)}
            <span className="text-white/35">▾</span>
          </button>
          {calendar && (
            <Calendar
              from={from}
              to={to}
              onCancel={() => setCalendar(false)}
              onApply={(nextFrom, nextTo) => {
                setPreset('custom')
                setFrom(nextFrom)
                setTo(nextTo)
                setCalendar(false)
              }}
            />
          )}
        </div>
        <button
          type="button"
          className="grid h-7 w-7 place-items-center rounded-full border border-white/15 text-[11px] text-white/40"
          onClick={() => openTab('/docs/pricing-usage')}
          aria-label="Usage help"
        >
          i
        </button>
        {(
          [
            ['1d', '1d'],
            ['7d', '7d'],
            ['30d', '30d'],
            ['mtd', 'MTD'],
            ['last', 'Last month'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => applyPreset(id)}
            className={`rounded-md px-2.5 py-1 text-[12px] ${
              preset === id ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Total tokens', total],
          ['Included', included],
          ['Your keys (BYOK)', byok],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-white/[0.06] bg-[#141413] px-5 py-4">
            <p className="text-[12px] text-white/40">{label}</p>
            <p className="mt-2 text-[28px] font-medium tracking-[-0.03em]">{formatTokens(Number(value))}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-[#141413] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-medium">Your Usage</p>
            <p className="mt-1 text-[12px] text-white/40">
              Your usage per day across this billing period.
              {lastSyncedAt ? (
                <span className="ml-2 text-white/30">
                  Updated {new Date(lastSyncedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              ) : null}
            </p>
          </div>
          <span className="rounded-md border border-white/10 px-2.5 py-1 text-[12px] text-white/50">Group By: Model</span>
        </div>
        <div className="mt-4">
          <UsageChart days={days} models={models} byDay={byDay} />
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {(models.length ? models : ['No data']).map((model) => (
            <span key={model} className="inline-flex items-center gap-2 text-[12px] text-white/50">
              <span
                className="h-1.5 w-6 rounded-sm"
                style={{ background: model === 'No data' ? 'rgba(255,255,255,0.2)' : colorFor(model, models) }}
              />
              {model}
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-md border border-white/12 px-3 py-1.5 text-[12px] text-white/70 hover:text-white"
          >
            <span aria-hidden>↓</span>
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="text-[12px] text-white/40">
              <tr className="border-b border-white/[0.06]">
                <th className="py-3 font-normal">Date ({tzLabel})</th>
                <th className="py-3 font-normal">Type</th>
                <th className="py-3 font-normal">Surface</th>
                <th className="py-3 font-normal">Model</th>
                <th className="py-3 text-right font-normal">Tokens</th>
                <th className="py-3 text-right font-normal">Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-white/35">
                    No data
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const includedRow = row.billed_to !== 'user'
                const catalogModel = catalogModelId(row.model)
                const kind = usageRowKind(catalogModel, row.prompt_tokens || 0, row.completion_tokens || 0)
                const costUsd = usageRowCostUsd(
                  catalogModel,
                  row.tokens || 0,
                  row.billed_to || 'platform',
                  row.prompt_tokens || 0,
                  row.completion_tokens || 0,
                )
                return (
                  <tr key={row.id} className="border-b border-white/[0.06]">
                    <td className="py-3 text-white/80">{formatUsageWhen(row.created_at)}</td>
                    <td className="py-3 text-white/70">
                      {kind === 'image' ? 'Image' : includedRow ? 'Included' : 'BYOK'}
                    </td>
                    <td className="py-3 text-white/70 capitalize">
                      {row.source === 'cli' ? 'Terminal' : row.source === 'desktop' ? 'Desktop' : 'Studio'}
                    </td>
                    <td className="py-3 text-white/80" title={catalogModel}>
                      {usageModelLabel(row.model)}
                    </td>
                    <td className="py-3 text-right text-white/70">{formatTokens(row.tokens || 0)}</td>
                    <td className="py-3 text-right text-white/70">
                      {includedRow
                        ? kind === 'image'
                          ? `$${costUsd.toFixed(2)}`
                          : 'Included'
                        : `$${costUsd.toFixed(2)}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
