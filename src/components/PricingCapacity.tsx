import {
  PLAN_CAPACITIES,
  PROVIDER_LOGO,
  SOUMTOK_AGENT,
  TYPICAL_AGENT_TURN,
  additionalModelCapacities,
  everydayModelCapacities,
  formatCount,
  turnsInPool,
  type PlanCapacity,
  type PoolCapacity,
} from '../../shared/planAchievements'
import { SoumtokGlobeAvatar } from './SoumtokGlobeAvatar'

const ORANGE = '#f54e00'

const EVERYDAY_IDS = ['deepseek-v4-flash', 'deepseek-v4-pro', 'gpt-4.1-mini'] as const
const ADDITIONAL_IDS = ['claude-opus-5', 'gpt-6-astra', 'claude-sonnet-5', 'grok-4.6'] as const

const MODEL_SHORT: Record<string, string> = {
  'deepseek-v4-flash': 'Flash',
  'deepseek-v4-pro': 'Pro',
  'gpt-4.1-mini': 'Mini',
  'claude-opus-5': 'Opus 5',
  'gpt-6-astra': 'GPT-6',
  'claude-sonnet-5': 'Sonnet 5',
  'grok-4.6': 'Grok 4.6',
}

function ModelLogos({ ids }: { ids: readonly string[] }) {
  const models = [...everydayModelCapacities(), ...additionalModelCapacities()].filter((m) =>
    ids.includes(m.id),
  )
  return (
    <div className="flex flex-wrap gap-1.5">
      {models.map((model) => {
        const logo = PROVIDER_LOGO[model.provider]
        return (
          <span
            key={model.id}
            title={model.name}
            className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-black/25 px-2 py-1"
          >
            <img
              src={logo.src}
              alt=""
              width={14}
              height={14}
              className="pricing-model-logo h-3.5 w-3.5 object-contain"
            />
            <span className="text-[10px] text-white/60">{MODEL_SHORT[model.id] || model.name}</span>
          </span>
        )
      })}
    </div>
  )
}

function PoolBlock({
  title,
  pool,
  models,
  additionalGrokTurns,
}: {
  title: string
  pool: PoolCapacity
  models: readonly string[]
  additionalGrokTurns?: number
}) {
  const turns = additionalGrokTurns ?? pool.flashAgentTurns
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#f54e00]/90">{title}</p>
      <p className="mt-2 text-[12px] text-white/45">${pool.poolUsd}/mo</p>
      <ul className="mt-2 space-y-1.5 text-[13px] leading-5 text-white/85">
        <li>
          <span className="font-medium text-[#f54e00]">{formatCount(turns)}</span> Agent turns
        </li>
        <li className="text-white/70">{pool.flashOutputTokens}</li>
        {!additionalGrokTurns && (
          <li className="text-[12px] text-white/55">
            {formatCount(pool.flashBuildPages)} pages · {formatCount(pool.fluxMaxImages)} images
          </li>
        )}
      </ul>
      <div className="mt-3">
        <ModelLogos ids={models} />
      </div>
    </div>
  )
}

function PlanReachCard({ plan, featured }: { plan: PlanCapacity; featured?: boolean }) {
  const e = plan.everyday
  const a = plan.additional
  const grok = additionalModelCapacities().find((m) => m.id === 'grok-4.6')
  const additionalTurns = a && grok ? turnsInPool(a.poolUsd, grok.agentTurnUsd) : 0
  const totalTokenLabel = (() => {
    const everydayOut = e.flashAgentTurns * TYPICAL_AGENT_TURN.completionTokens
    const extraOut = additionalTurns * TYPICAL_AGENT_TURN.completionTokens
    const total = everydayOut + extraOut
    if (total >= 1_000_000) return `~${(total / 1_000_000).toFixed(1).replace(/\.0$/, '')}M tokens`
    if (total >= 1_000) return `~${Math.round(total / 1000)}K tokens`
    return `~${total} tokens`
  })()

  return (
    <article
      className={`flex flex-col rounded-xl border p-5 ${
        featured
          ? 'border-[#f54e00]/50 bg-gradient-to-b from-[#1f140d] to-[#121211] shadow-[0_0_40px_rgba(245,78,0,0.08)]'
          : 'border-[#f54e00]/25 bg-gradient-to-b from-[#181210] to-[#121211]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[17px] font-semibold tracking-[-0.02em]">{plan.planName}</p>
        {featured && (
          <span className="rounded-full bg-[#f54e00]/15 px-2 py-0.5 text-[10px] font-medium text-[#f54e00]">
            Popular
          </span>
        )}
      </div>

      <p className="mt-3 text-[14px] font-medium text-white/90">
        {totalTokenLabel} <span className="font-normal text-white/45">total / mo</span>
      </p>
      <p className="mt-0.5 text-[11px] text-white/35">
        {TYPICAL_AGENT_TURN.promptTokens.toLocaleString()} in + {TYPICAL_AGENT_TURN.completionTokens.toLocaleString()}{' '}
        out per turn on Flash
      </p>

      <div className={`mt-4 space-y-2 ${a ? '' : ''}`}>
        {a ? (
          <>
            <PoolBlock title="Everyday" pool={e} models={EVERYDAY_IDS} />
            <PoolBlock
              title="Additional"
              pool={a}
              models={ADDITIONAL_IDS}
              additionalGrokTurns={additionalTurns}
            />
          </>
        ) : (
          <PoolBlock title="Everyday" pool={e} models={EVERYDAY_IDS} />
        )}
      </div>
    </article>
  )
}

export function PricingCapacity() {
  return (
    <div className="mt-16 border-t border-white/[0.06] pt-14">
      <div className="mx-auto max-w-[640px] rounded-xl border border-[#f54e00]/30 bg-gradient-to-br from-[#1c130e] via-[#141210] to-[#121211] px-5 py-5 sm:flex sm:items-center sm:gap-5 sm:px-6">
        <SoumtokGlobeAvatar color={ORANGE} size={56} state="idle" className="mx-auto shrink-0 sm:mx-0" />
        <div className="mt-4 text-center sm:mt-0 sm:text-left">
          <p className="text-[16px] font-semibold tracking-[-0.02em]">{SOUMTOK_AGENT.name}</p>
          <p className="mt-1 text-[13px] leading-6 text-white/55">
            Free on every plan · ~{SOUMTOK_AGENT.shortSessionTokenSavePct}% fewer tokens typical · up to ~
            {SOUMTOK_AGENT.longSessionTokenSavePct}% on long sessions
          </p>
        </div>
      </div>

      <h3 className="mt-12 text-center text-[20px] font-semibold tracking-[-0.03em] sm:text-[24px]">
        What you get each month
      </h3>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        {PLAN_CAPACITIES.map((plan) => (
          <PlanReachCard key={plan.planId} plan={plan} featured={plan.planId === 'pro'} />
        ))}
      </div>
    </div>
  )
}
