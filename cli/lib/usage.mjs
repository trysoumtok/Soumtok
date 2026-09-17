import { c } from './ansi.mjs'

export function formatTokens(n) {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  return String(v)
}

export function formatTurnUsage(result = {}) {
  const prompt = result.promptTokens || 0
  const completion = result.completionTokens || 0
  const total = prompt + completion
  if (!total) return null
  const model = result.model || result.usedModel || 'auto'
  const billed = result.billedTo === 'user' ? 'BYOK' : 'included pool'
  return `${model} · ↑${formatTokens(prompt)} ↓${formatTokens(completion)} (${formatTokens(total)} tokens · ${billed})`
}

export async function fetchAccountUsage(client) {
  const res = await client.api('GET', '/api/desktop/summary')
  if (res.status !== 200) throw new Error(res.data?.error || 'Could not load account usage')
  return res.data
}

export function printAccountUsage(summary) {
  console.log('')
  console.log(c.bold('Account usage (this month)'))
  console.log(
    c.dim(
      `Plan: ${summary.planLabel || summary.plan || '—'} · Included ${formatTokens(summary.includedTokens || 0)} tokens (${summary.includedPct ?? 0}% of quota)`,
    ),
  )
  if (summary.byokTokens) {
    console.log(c.dim(`BYOK: ${formatTokens(summary.byokTokens)} tokens`))
  }
  const pools = summary.pools
  if (pools) {
    console.log(
      c.dim(
        `Everyday pool: $${Number(pools.cheapUsedUsd || 0).toFixed(2)} / $${Number(pools.cheapDisplayUsd || 0).toFixed(2)} · Additional: $${Number(pools.premiumUsedUsd || 0).toFixed(2)} / $${Number(pools.premiumDisplayUsd || 0).toFixed(2)}`,
      ),
    )
  }
  const top = summary.topModels || []
  if (top.length) {
    console.log(c.dim('Top models:'))
    for (const row of top.slice(0, 5)) {
      console.log(c.dim(`  ${row.model}  ${formatTokens(row.tokens)} tokens`))
    }
  }
  console.log(c.dim('Updates live on soumtok.com → Dashboard → Usage'))
  console.log('')
}
