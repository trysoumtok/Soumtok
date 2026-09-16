const ON_DEMAND_PER_M = 2

export type UsageCsvRow = {
  id: string
  created_at: string
  provider?: string
  model: string
  billed_to: string
  source?: string
  prompt_tokens?: number
  completion_tokens?: number
  tokens: number
}

export type UsageCsvUsage = {
  model: string
  provider: string
  billed_to: string
  calls: number
  prompt_tokens: number
  completion_tokens: number
}

function cell(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function row(values: Array<string | number | null | undefined>) {
  return values.map(cell).join(',')
}

function money(tokens: number, included: boolean) {
  if (included) return '0.00'
  return ((tokens / 1_000_000) * ON_DEMAND_PER_M).toFixed(4)
}

function typeLabel(billedTo: string) {
  return billedTo === 'user' ? 'On-Demand' : 'Included'
}

function utcStamp(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC')
}

function utcDate(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toISOString().slice(0, 10)
}

function utcTime(value: string) {
  return new Date(value).toISOString().slice(11, 19)
}

export function buildUsageCsv(input: {
  account?: string
  from: Date
  to: Date
  rows: UsageCsvRow[]
  usage: UsageCsvUsage[]
}) {
  const inclusiveEnd = new Date(input.to.getTime() - 86400000)
  const generated = new Date()
  const included = input.rows.filter((item) => item.billed_to !== 'user')
  const onDemand = input.rows.filter((item) => item.billed_to === 'user')
  const includedTokens = included.reduce((sum, item) => sum + (item.tokens || 0), 0)
  const onDemandTokens = onDemand.reduce((sum, item) => sum + (item.tokens || 0), 0)
  const totalTokens = includedTokens + onDemandTokens
  const promptTotal = input.rows.reduce((sum, item) => sum + (item.prompt_tokens || 0), 0)
  const completionTotal = input.rows.reduce((sum, item) => sum + (item.completion_tokens || 0), 0)

  const byDay = new Map<string, { requests: number; included: number; onDemand: number }>()
  for (const item of input.rows) {
    const day = utcDate(item.created_at)
    const current = byDay.get(day) || { requests: 0, included: 0, onDemand: 0 }
    current.requests += 1
    if (item.billed_to === 'user') current.onDemand += item.tokens || 0
    else current.included += item.tokens || 0
    byDay.set(day, current)
  }

  const lines = [
    row(['Soumtok']),
    row(['Usage Report']),
    row([]),
    row(['Field', 'Value']),
    row(['Product', 'Soumtok']),
    row(['Report', 'Usage']),
    row(['Account', input.account || '']),
    row(['Period start (UTC)', utcDate(input.from)]),
    row(['Period end (UTC)', utcDate(inclusiveEnd)]),
    row(['Timezone', 'UTC']),
    row(['Generated at', utcStamp(generated)]),
    row(['Requests', input.rows.length]),
    row(['Prompt tokens', promptTotal]),
    row(['Completion tokens', completionTotal]),
    row(['Total tokens', totalTokens]),
    row(['Included tokens', includedTokens]),
    row(['On-demand tokens', onDemandTokens]),
    row(['On-demand cost (USD)', money(onDemandTokens, false)]),
    row(['On-demand rate', 'USD 2.00 per 1,000,000 tokens']),
    row(['Included cost', 'Covered by plan — not billed as on-demand']),
    row([]),
    row(['MODEL BREAKDOWN']),
    row([
      'Model',
      'Provider',
      'Billed to',
      'Type',
      'Requests',
      'Prompt tokens',
      'Completion tokens',
      'Total tokens',
      'Cost (USD)',
    ]),
    ...input.usage.map((item) => {
      const tokens = (item.prompt_tokens || 0) + (item.completion_tokens || 0)
      const includedRow = item.billed_to !== 'user'
      return row([
        item.model,
        item.provider,
        item.billed_to,
        typeLabel(item.billed_to),
        item.calls,
        item.prompt_tokens || 0,
        item.completion_tokens || 0,
        tokens,
        includedRow ? 'Included' : money(tokens, false),
      ])
    }),
    ...(input.usage.length === 0 ? [row(['No model usage in this period', '', '', '', 0, 0, 0, 0, '0.00'])] : []),
    row([]),
    row(['DAILY BREAKDOWN']),
    row(['Date (UTC)', 'Requests', 'Included tokens', 'On-demand tokens', 'Total tokens', 'Cost (USD)']),
    ...[...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, item]) =>
        row([
          day,
          item.requests,
          item.included,
          item.onDemand,
          item.included + item.onDemand,
          money(item.onDemand, false),
        ]),
      ),
    ...(byDay.size === 0 ? [row(['No daily usage in this period', 0, 0, 0, 0, '0.00'])] : []),
    row([]),
    row(['REQUEST DETAIL']),
    row([
      '#',
      'Request ID',
      'Date (UTC)',
      'Time (UTC)',
      'ISO 8601',
      'Type',
      'Surface',
      'Billed to',
      'Provider',
      'Model',
      'Prompt tokens',
      'Completion tokens',
      'Total tokens',
      'Cost (USD)',
      'Rate (USD / 1M tokens)',
      'Notes',
    ]),
    ...input.rows.map((item, index) => {
      const includedRow = item.billed_to !== 'user'
      return row([
        index + 1,
        item.id,
        utcDate(item.created_at),
        utcTime(item.created_at),
        new Date(item.created_at).toISOString(),
        typeLabel(item.billed_to),
        item.source === 'desktop' ? 'Desktop' : 'Studio',
        item.billed_to === 'user' ? 'Your provider key' : 'Soumtok included',
        item.provider || '',
        item.model,
        item.prompt_tokens || 0,
        item.completion_tokens || 0,
        item.tokens || 0,
        includedRow ? 'Included' : money(item.tokens || 0, false),
        includedRow ? '—' : ON_DEMAND_PER_M.toFixed(2),
        includedRow ? 'Covered by Soumtok plan' : 'Billed at on-demand rate',
      ])
    }),
    ...(input.rows.length === 0
      ? [row(['', '', '', '', '', '', '', '', 'No requests in this period', 0, 0, 0, '0.00', '', ''])]
      : []),
  ]

  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function usageCsvFilename(from: Date, to: Date) {
  const end = new Date(to.getTime() - 86400000)
  return `Soumtok-Usage-${utcDate(from)}-to-${utcDate(end)}.csv`
}
