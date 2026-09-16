/** Model vendor list prices + Soumtok billing paths (mirrors shared/modelPricing.ts). */
;(function (root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.SoumtokModelPricing = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function modelPricingFactory() {
  const SOUMTOK_ON_DEMAND_USD_PER_M = 2
  const TRIAL_TOKEN_QUOTA = 12000
  const TOKENS_PER_CREDIT = 8000
  const PLAN_CREDIT = { pro: 40 }

  function fmtUsd(n) {
    if (n < 0.01 && n > 0) return '<$0.01'
    if (n < 1) return `$${n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`
    return `$${n.toFixed(2)}`
  }

  function vendorTotal(inTok, outTok, v) {
    return (inTok / 1_000_000) * v.inputPerM + (outTok / 1_000_000) * v.outputPerM
  }

  function onDemandTotal(totalTok) {
    return (totalTok / 1_000_000) * SOUMTOK_ON_DEMAND_USD_PER_M
  }

  function tierVendor(cost) {
    const map = {
      Included: null,
      Cheapest: { inputPerM: 0.14, outputPerM: 0.28, note: 'Flash-class list price.' },
      Cheap: { inputPerM: 0.15, outputPerM: 0.6, note: 'Mini / nano class.' },
      Low: { inputPerM: 0.4, outputPerM: 1.6, note: 'Haiku / mini class.' },
      Mid: { inputPerM: 2.5, outputPerM: 10, note: 'Sonnet / GPT-4o class.' },
      Higher: { inputPerM: 2, outputPerM: 6, note: 'Grok 4.6 short-prompt card.' },
      High: { inputPerM: 10, outputPerM: 30, note: 'Opus / Codex class.' },
      Highest: { inputPerM: 10, outputPerM: 50, note: 'Flagship tier.' },
      Varies: { inputPerM: 2.5, outputPerM: 10, note: 'Live routing sets invoice.' },
    }
    return map[cost] ?? { inputPerM: 2.5, outputPerM: 10, note: 'Estimated from cost tier.' }
  }

  function vendorForModel(model) {
    const id = String(model.id || '').toLowerCase()
    if (model.cost === 'Included' || id === 'soumtok-agent') return null
    if (/deepseek/.test(id) || model.provider === 'deepseek') {
      return { inputPerM: 0.14, outputPerM: 0.28, note: 'DeepSeek API list price per 1M in/out.' }
    }
    if (/gpt-6-astra/.test(id)) return { inputPerM: 10, outputPerM: 50, note: 'Input doubles above 272K prompt on Astra Standard.' }
    if (/gpt-5\.6-sol/.test(id)) return { inputPerM: 5, outputPerM: 20, note: 'GPT-5.6 Sol flagship tier.' }
    if (/gpt-5\.6-terra/.test(id)) return { inputPerM: 3, outputPerM: 12, note: 'GPT-5.6 Terra balanced tier.' }
    if (/gpt-5\.6-luna/.test(id)) return { inputPerM: 1, outputPerM: 4, note: 'GPT-5.6 Luna cost-efficient tier.' }
    if (/gpt-5\.3-codex/.test(id)) return { inputPerM: 10, outputPerM: 30, note: 'Codex agent tier.' }
    if (/gpt-4\.1-nano|gpt-5\.4-nano|gpt-5-nano/.test(id)) return { inputPerM: 0.1, outputPerM: 0.4, note: 'Nano band.' }
    if (/gpt-4\.1-mini|gpt-5-mini|gpt-5\.4-mini|gpt-4o-mini/.test(id)) return { inputPerM: 0.4, outputPerM: 1.6, note: 'Mini band.' }
    if (/gpt-4\.1(?!-)/.test(id)) return { inputPerM: 2, outputPerM: 8, note: 'GPT-4.1 list price.' }
    if (/gpt-4o(?!-)/.test(id)) return { inputPerM: 2.5, outputPerM: 10, note: 'GPT-4o list price.' }
    if (/o1-pro/.test(id)) return { inputPerM: 150, outputPerM: 600, note: 'o1 Pro list price.' }
    if (/o1|o3(?!-mini)/.test(id)) return { inputPerM: 15, outputPerM: 60, note: 'Deep reasoning list price.' }
    if (/o3-mini|o4-mini/.test(id)) return { inputPerM: 1.1, outputPerM: 4.4, note: 'Reasoning mini list price.' }
    if (/gpt-5\.5-pro|gpt-5\.4-pro|gpt-5\.2-pro|gpt-5-pro/.test(id)) return { inputPerM: 10, outputPerM: 30, note: 'GPT Pro tier.' }
    if (/claude-haiku/.test(id)) return { inputPerM: 0.8, outputPerM: 4, note: 'Claude Haiku list price.' }
    if (/claude-sonnet/.test(id)) return { inputPerM: 3, outputPerM: 15, note: 'Claude Sonnet list price.' }
    if (/claude-fable/.test(id)) return { inputPerM: 18, outputPerM: 90, note: 'Fable longform tier.' }
    if (/claude-opus/.test(id)) return { inputPerM: 15, outputPerM: 75, note: 'Claude Opus list price.' }
    if (/grok-4\.6|grok-4\.5/.test(id)) {
      return { inputPerM: 2, outputPerM: 6, note: 'Under 200K prompt; ≥200K bills $4 / $12 on full request.' }
    }
    if (/grok-4\.20/.test(id)) return { inputPerM: 2, outputPerM: 6, note: 'Grok 4.20 class list price.' }
    return tierVendor(model.cost)
  }

  function billingPaths(model) {
    const proPool = (PLAN_CREDIT.pro * TOKENS_PER_CREDIT).toLocaleString()
    const trialNote =
      model.id === 'deepseek-v4-flash' || model.cost === 'Included'
        ? `Trial includes ~${TRIAL_TOKEN_QUOTA.toLocaleString()} tokens on DeepSeek V4.1 Flash. No per-token charge until the pool is gone.`
        : 'Trial only routes a small pool on DeepSeek V4.1 Flash / Gemma. Other models need Pro+ or your key.'
    return [
      {
        path: 'Soumtok included',
        whoPays: 'Your plan pool',
        rate: 'No extra per-token charge while inside the pool',
        detail: `${trialNote} Pro includes ~${proPool} tokens per billing cycle. See Dashboard → Usage and Spending.`,
      },
      {
        path: 'Your API key (BYOK)',
        whoPays: 'Your provider account',
        rate: 'Vendor list price (input + output tokens)',
        detail: `Dashboard → Keys. ${model.provider} bills you directly — not on Soumtok subscription.`,
      },
      {
        path: 'On-demand (past included)',
        whoPays: 'Soumtok on-demand meter',
        rate: `$${SOUMTOK_ON_DEMAND_USD_PER_M.toFixed(2)} per 1M total tokens`,
        detail: 'Flat Soumtok rate after included pool on platform routing. Same $/M for Flash and Opus — but expensive models use more tokens per turn.',
      },
    ]
  }

  function resolveModelPricing(model) {
    const vendor = vendorForModel(model)
    const examples = [
      { label: 'Small Test Hub turn', inputTokens: 1500, outputTokens: 800 },
      { label: 'Build a calculator page', inputTokens: 2500, outputTokens: 4000 },
      { label: 'Hard bug with file attached', inputTokens: 12000, outputTokens: 3500 },
    ].map((s) => {
      const total = s.inputTokens + s.outputTokens
      const vendorUsd = vendor ? fmtUsd(vendorTotal(s.inputTokens, s.outputTokens, vendor)) : 'Included on platform'
      return {
        ...s,
        vendorUsd,
        includedNote: `Uses ${total.toLocaleString()} tokens from included pool.`,
        onDemandUsd: fmtUsd(onDemandTotal(total)),
        byokNote: vendor ? `~${vendorUsd} on your ${model.provider} bill.` : 'Platform included.',
      }
    })
    const tips = [
      'Included tokens are model-agnostic — 1 token is 1 token whether you pick Flash or Opus.',
      `On-demand is flat $${SOUMTOK_ON_DEMAND_USD_PER_M}/M on Soumtok platform routing.`,
      'BYOK bills at vendor list price. Check Dashboard → Usage for included vs on-demand vs your-key rows.',
      'Reasoning turns cost more — watch completion tokens.',
    ]
    if (vendor && vendor.inputPerM >= 10) tips.push('Premium list price — verbose outputs add up fast on BYOK.')
    if (/grok-4\.6|grok-4\.5/.test(model.id)) tips.push('Grok jumps price tier when prompt crosses 200K tokens.')
    if (/gpt-6-astra/.test(model.id)) tips.push('Astra doubles input price above 272K prompt tokens.')
    if (model.id === 'deepseek-v4-flash') tips.push(`Trial default: ~${TRIAL_TOKEN_QUOTA.toLocaleString()} included tokens.`)

    if (!vendor) {
      return {
        headline: 'Included on Soumtok',
        vendorLine: 'Platform routing — no separate vendor list price for this row.',
        vendor: null,
        soumtokTier: model.cost,
        billingPaths: billingPaths(model),
        examples,
        tips,
      }
    }
    return {
      headline: `${fmtUsd(vendor.inputPerM)} in · ${fmtUsd(vendor.outputPerM)} out`,
      vendorLine: `${fmtUsd(vendor.inputPerM)} / ${fmtUsd(vendor.outputPerM)} per 1M tokens (input / output) — ${vendor.note}`,
      vendor,
      soumtokTier: model.cost,
      billingPaths: billingPaths(model),
      examples,
      tips,
    }
  }

  return { SOUMTOK_ON_DEMAND_USD_PER_M, resolveModelPricing }
})
