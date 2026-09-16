import assert from 'node:assert/strict'
import test from 'node:test'
import { repairIntentText, resolveToolName } from './typoIntent.ts'

test('repairs glued and misspelled intent so tools still match', () => {
  const got = repairIntentText('addtols that agent can rea ad undetand misplell it understand still')
  assert.match(got, /add tools/i)
  assert.match(got, /\bread\b/i)
  assert.match(got, /\bunderstand\b/i)
  assert.match(got, /\bmisspell\b/i)
})

test('genera / iamge still become generate image, general does not', () => {
  assert.match(repairIntentText('genera an eagle iamge for me'), /generate an eagle image for me/i)
  assert.match(repairIntentText('geneearte a new one with a man dancing'), /generate a new one with a man dancing/i)
  assert.match(repairIntentText('a general question about images'), /general question/i)
  assert.doesNotMatch(repairIntentText('a general question about images'), /\bgenerate\b/i)
  assert.match(repairIntentText('fix teh footer them toggle'), /the footer/i)
  assert.doesNotMatch(repairIntentText('fix teh footer them toggle'), /\bfolder\b/i)
})

test('misspelled tool names still resolve', () => {
  assert.equal(resolveToolName('geneate_image'), 'generate_image')
  assert.equal(resolveToolName('genera_image'), 'generate_image')
  assert.equal(resolveToolName('listdir'), 'list_dir')
  assert.equal(resolveToolName('rea'), 'read')
  assert.equal(resolveToolName('read'), 'read')
  assert.equal(resolveToolName('wipe_workspace'), 'wipe_workspace')
  assert.notEqual(resolveToolName('wipe'), 'wipe_workspace')
})
