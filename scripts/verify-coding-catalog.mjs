/**
 * Lists Soumtok coding models (no Google) and API param flags per id.
 * Run: node scripts/verify-coding-catalog.mjs
 */
import {
  anthropicOmitsSamplingParams,
  openaiOmitsTemperature,
  soumtokCodingModels,
  usesMaxCompletionTokens,
} from '../shared/models.ts'

const models = soumtokCodingModels()
console.log(`Soumtok coding models: ${models.length} (providers: deepseek, openai, anthropic, xai)\n`)

let google = 0
for (const m of models) {
  if (m.provider === 'google') google++
  const flags = []
  if (m.provider === 'anthropic' && anthropicOmitsSamplingParams(m.id)) flags.push('no-temperature')
  if (m.provider === 'openai' && openaiOmitsTemperature(m.id)) flags.push('no-temperature')
  if (usesMaxCompletionTokens(m.provider, m.id)) flags.push('max_completion_tokens')
  console.log(`${m.provider.padEnd(10)} ${m.id.padEnd(32)} ${flags.join(', ') || 'standard'}`)
}

if (google) {
  console.error('\nFAIL: Google models still in catalog')
  process.exit(1)
}
console.log('\nOK')
