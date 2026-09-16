import assert from 'node:assert/strict'
import test from 'node:test'
import { imageChargeTokens, imageChargeUsd, imageVendorUsd } from './imageBilling.ts'

test('Flux 2 Max bills vendor cost plus 30% as tokens', () => {
  assert.equal(imageVendorUsd('black-forest-labs/flux-2-max'), 0.06)
  assert.equal(imageChargeUsd('black-forest-labs/flux-2-max'), 0.078)
  assert.equal(imageChargeTokens('black-forest-labs/flux-2-max'), 39_000)
})

test('Schnell images bill at the cheaper rate', () => {
  assert.equal(imageChargeTokens('fal-ai/flux/schnell'), 1950)
})
