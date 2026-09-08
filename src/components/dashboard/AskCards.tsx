import { useState } from 'react'
import { livePlanEstimate, type AgentEvent, type AskQuestion } from '../../../shared/agent'
import { formatUserCode } from '../../../shared/connectLinks'
import { PluginLogo } from './PluginLogos'

export function AskCard({
  event,
  locked,
  onSubmit,
  onSkip,
}: {
  event: Extract<AgentEvent, { kind: 'ask' }>
  locked?: boolean
  onSubmit?: (answers: Record<string, string[]>) => void
  onSkip?: () => void
}) {
  const [picked, setPicked] = useState<Record<string, string[]>>(event.answers || {})
  const [custom, setCustom] = useState<Record<string, string>>({})
  const done = Boolean(event.answers) || locked

  function toggle(question: AskQuestion, label: string) {
    if (done) return
    setPicked((current) => {
      const existing = current[question.id] || []
      if (question.allowMultiple) {
        const next = existing.includes(label) ? existing.filter((item) => item !== label) : [...existing, label]
        return { ...current, [question.id]: next }
      }
      return { ...current, [question.id]: existing[0] === label ? [] : [label] }
    })
  }

  function merged(): Record<string, string[]> {
    const next = { ...picked }
    for (const question of event.questions) {
      const extra = custom[question.id]?.trim()
      if (!extra) continue
      const current = next[question.id] || []
      if (!current.includes(extra)) next[question.id] = [...current, extra]
    }
    return next
  }

  const ready = event.questions.every((question) => {
    const extra = custom[question.id]?.trim()
    return (picked[question.id] || []).length > 0 || Boolean(extra)
  })

  return (
    <div className="max-w-[560px] text-[14px] leading-6 text-white/80">
      <p className="text-[15px] font-medium text-white">{event.title.replace(/\.+$/, '')}</p>
      {event.intro && <p className="mt-1 text-[13px] leading-6 text-white/50">{event.intro}</p>}
      <div className="mt-5 space-y-6">
        {event.questions.map((question, index) => {
          const selected = picked[question.id] || []
          return (
            <div key={question.id}>
              <p className="text-[14px] text-white">
                {index + 1}. {question.prompt.replace(/\?+$/, '')}?
              </p>
              <p className="mt-0.5 text-[12px] text-white/35">
                {question.allowMultiple ? 'Select any that apply' : 'Select one'}
              </p>
              <div className="mt-2 space-y-0.5">
                {question.options.map((option, optionIndex) => {
                  const on = selected.includes(option.label)
                  const letter = String.fromCharCode(97 + optionIndex)
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={done}
                      onClick={() => toggle(question, option.label)}
                      className={`flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left ${
                        on ? 'text-white' : 'text-white/55 hover:bg-white/[0.04] hover:text-white/90'
                      } disabled:opacity-70`}
                    >
                      <span className={`w-5 shrink-0 tabular-nums ${on ? 'text-white' : 'text-white/35'}`}>{letter}.</span>
                      <span>
                        {option.label}
                        {option.hint ? <span className="block text-[12px] text-white/35">{option.hint}</span> : null}
                      </span>
                    </button>
                  )
                })}
              </div>
              {question.allowCustom && !done && (
                <input
                  value={custom[question.id] || ''}
                  onChange={(event) => setCustom((current) => ({ ...current, [question.id]: event.target.value }))}
                  placeholder="Or type your own"
                  className="mt-2 w-full border-0 border-b border-white/12 bg-transparent px-1.5 py-1.5 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-white/35"
                />
              )}
              {done && (event.answers?.[question.id] || []).length > 0 && (
                <p className="mt-2 text-[13px] text-white/45">
                  {event.answers?.[question.id]?.join(', ')}
                </p>
              )}
            </div>
          )
        })}
      </div>
      {!done && (
        <div className="mt-6 flex items-center gap-4">
          <button
            type="button"
            disabled={!ready}
            onClick={() => onSubmit?.(merged())}
            className="text-[13px] text-white disabled:text-white/25"
          >
            Continue
          </button>
          <button type="button" onClick={onSkip} className="text-[13px] text-white/40 hover:text-white/70">
            You decide
          </button>
        </div>
      )}
    </div>
  )
}

export function PlanCard({
  event,
  locked,
  onApprove,
  onChange,
  files,
  messages,
}: {
  event: Extract<AgentEvent, { kind: 'plan' }>
  locked?: boolean
  onApprove?: () => void
  onChange?: () => void
  files?: Record<string, string>
  messages?: { content?: string }[]
}) {
  const done = Boolean(event.approved) || locked
  const estimate = livePlanEstimate({ files, messages, plan: event })
  return (
    <div className="overflow-hidden rounded-2xl border border-white/12 bg-[#141413]">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/35">Plan</p>
        <p className="mt-1 text-[14px] font-medium text-white">{event.title}</p>
        {event.summary && <p className="mt-1 text-[13px] leading-5 text-white/55">{event.summary}</p>}
        <p className="mt-2 text-[12px] text-white/35">
          {estimate.label}
          <span className="text-white/25">
            {' '}
            · prompt ~{estimate.prompt < 1000 ? estimate.prompt : `${Math.round(estimate.prompt / 1000)}k`} · output ~
            {estimate.completion < 1000 ? estimate.completion : `${Math.round(estimate.completion / 1000)}k`}
          </span>
        </p>
      </div>
      {event.steps.length > 0 && (
        <ol className="space-y-1.5 px-4 py-3 text-[13px] text-white/70">
          {event.steps.map((step, index) => (
            <li key={step} className="flex gap-2">
              <span className="w-4 shrink-0 text-white/30">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}
      {event.files.length > 0 && (
        <p className="border-t border-white/[0.06] px-4 py-2.5 font-mono text-[12px] text-white/40">
          {event.files.join(' · ')}
        </p>
      )}
      {!done ? (
        <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-4 py-3">
          <button type="button" onClick={onChange} className="rounded-lg px-3 py-1.5 text-[13px] text-white/45 hover:text-white">
            Change
          </button>
          <button
            type="button"
            onClick={onApprove}
            className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-[#111110]"
          >
            Build this
          </button>
        </div>
      ) : (
        event.approved && <p className="px-4 py-2.5 text-[12px] text-white/40">Approved — building with this plan.</p>
      )}
    </div>
  )
}

export function PromptChips({ items, onPick }: { items: string[]; onPick?: (text: string) => void }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onPick?.(item)}
          className="rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 text-left text-[13px] text-white/70 hover:border-white/25 hover:text-white"
        >
          {item}
        </button>
      ))}
    </div>
  )
}

export function CapabilityLine({ label, text }: { label: string; text: string }) {
  return (
    <p className="max-w-[560px] truncate text-[13px] text-white/55">
      <span className="mr-2 text-[11px] uppercase tracking-[0.12em] text-white/30">{label}</span>
      {text}
    </p>
  )
}

export function AgentLiveCard({
  mode: _mode,
  step,
  files,
  elapsed,
  steps = [],
}: {
  mode: string
  step: string
  files: string[]
  elapsed: number
  steps?: string[]
}) {
  const seconds = Math.max(0, Math.floor(elapsed))
  const clock = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const active = step.toLowerCase()
  return (
    <div className="max-w-[560px]">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[14px] text-white">{step || 'Working'}</p>
        <span className="shrink-0 text-[12px] tabular-nums text-white/35">{clock}</span>
      </div>
      {steps.length > 0 && (
        <ol className="mt-3 space-y-1.5">
          {steps.map((item, index) => {
            const on = active.includes(item.slice(0, 18).toLowerCase())
            return (
              <li key={item} className={`flex gap-3 text-[13px] leading-5 ${on ? 'text-white/80' : 'text-white/35'}`}>
                <span className="w-4 shrink-0 tabular-nums text-white/30">{index + 1}.</span>
                <span>{item}</span>
              </li>
            )
          })}
        </ol>
      )}
      {files.length > 0 && (
        <ul className="mt-3 space-y-1">
          {files.map((path) => (
            <li key={path} className="flex gap-2 font-mono text-[12px] leading-5 text-white/70">
              <span className="shrink-0 text-[#f54e00]">✓</span>
              <span className="min-w-0 truncate">{path}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function TodoList({ event }: { event: Extract<AgentEvent, { kind: 'todo' }> }) {
  const done = event.items.filter((item) => item.done).length
  return (
    <div className="rounded-xl border border-white/10 bg-[#141413] px-3 py-2.5">
      <p className="mb-2 text-[12px] text-white/35">
        {done}/{event.items.length} done
      </p>
      <ul className="space-y-1">
        {event.items.map((item) => (
          <li key={item.text} className={`flex gap-2 text-[13px] ${item.done ? 'text-white/35 line-through' : 'text-white/75'}`}>
            <span className="mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border border-white/20 text-[9px]">
              {item.done ? '✓' : ''}
            </span>
            {item.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SecurityCard({
  event,
  onOpenEnv,
  onOpenKeys,
}: {
  event: Extract<AgentEvent, { kind: 'security' }>
  onOpenEnv?: () => void
  onOpenKeys?: () => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#f54e00]/35 bg-[#1a100c]">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <p className="text-[12px] uppercase tracking-[0.12em] text-[#f54e00]/80">Security</p>
        <p className="mt-1 text-[14px] font-medium text-white">{event.title}</p>
        <p className="mt-1 text-[13px] leading-5 text-white/55">{event.text}</p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
        {event.keys && (
          <button
            type="button"
            onClick={onOpenKeys}
            className="rounded-lg px-3 py-1.5 text-[13px] text-white/50 hover:text-white"
          >
            Open API keys
          </button>
        )}
        <button
          type="button"
          onClick={onOpenEnv}
          className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-[#111110]"
        >
          Open .env
        </button>
      </div>
    </div>
  )
}

export function ConnectCard({
  event,
  onOpen,
  onDone,
}: {
  event: Extract<AgentEvent, { kind: 'connect' }>
  onOpen?: () => void
  onDone?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const code = event.code ? formatUserCode(event.code) : ''
  return (
    <div className="overflow-hidden rounded-2xl border border-[#f54e00]/30 bg-[#1a100c]">
      <div className="flex items-start gap-3 border-b border-white/[0.06] px-4 py-3">
        <PluginLogo id={event.provider} className="h-8 w-8" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] uppercase tracking-[0.12em] text-[#f54e00]/80">Connect</p>
          <p className="mt-1 text-[14px] font-medium text-white">
            {event.connected ? `${event.name} is connected` : `Connect ${event.name}`}
          </p>
          <p className="mt-1 text-[13px] leading-5 text-white/55">
            {event.connected
              ? 'You can keep going. The next message can use this account.'
              : event.detail ||
                'Open the link, sign in, and enter the code if one is shown. Then come back and tap I’ve connected.'}
          </p>
        </div>
      </div>
      {code && !event.connected && (
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-4">
          <p className="font-mono text-[22px] font-semibold tracking-[0.18em] text-white">{code}</p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(event.code || '')
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1200)
            }}
            className="rounded-lg px-3 py-1.5 text-[13px] text-white/55 hover:text-white"
          >
            {copied ? 'Copied' : 'Copy code'}
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
        {event.url && !event.connected && (
          <a
            href={event.url}
            target="_blank"
            rel="noreferrer"
            onClick={onOpen}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-[#111110]"
          >
            Open {event.name}
          </a>
        )}
        {!event.connected && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg px-3 py-1.5 text-[13px] text-white/55 hover:text-white"
          >
            I’ve connected
          </button>
        )}
      </div>
    </div>
  )
}
