import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_STILL_ASPECT,
  falImageSize,
  normalizeStillAspect,
  parseStillRequest,
  stillAspectFromText,
  stripStillAspectFromPrompt,
} from './stillAspect.ts'

test('still aspect defaults to 1:1', () => {
  assert.equal(DEFAULT_STILL_ASPECT, '1:1')
  assert.equal(stillAspectFromText('generate an eagle image'), '1:1')
  assert.equal(stillAspectFromText('portrait of a woman on a hill'), '1:1')
  assert.equal(normalizeStillAspect(''), '1:1')
  assert.equal(normalizeStillAspect('nope'), '1:1')
})

test('still aspect reads ratio from the prompt', () => {
  assert.equal(stillAspectFromText('generate a 16:9 eagle image'), '16:9')
  assert.equal(stillAspectFromText('make a car photo ratio 9:16'), '9:16')
  assert.equal(stillAspectFromText('watch in square format'), '1:1')
  assert.equal(stillAspectFromText('a lake in landscape format'), '16:9')
  assert.equal(stillAspectFromText('story shot in portrait format'), '9:16')
  assert.equal(stillAspectFromText('rato 4:3 supercar'), '4:3')
})

test('ratio words are stripped so they are not painted into the image', () => {
  assert.equal(stripStillAspectFromPrompt('eagle 16:9 flying'), 'eagle flying')
  const parsed = parseStillRequest('generate a 16:9 eagle image')
  assert.equal(parsed.aspect, '16:9')
  assert.match(parsed.prompt, /eagle/i)
  assert.doesNotMatch(parsed.prompt, /16:9/)
})

test('fal image size maps 1:1 to square', () => {
  assert.equal(falImageSize('1:1'), 'square_hd')
  assert.equal(falImageSize('16:9'), 'landscape_16_9')
  assert.equal(falImageSize('9:16'), 'portrait_16_9')
})
