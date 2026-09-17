const test = require('node:test')

const assert = require('node:assert/strict')

const { parseAgentChoices, stripNumberedListForChoices } = require('./agentChoices.cjs')



test('parseAgentChoices finds numbered pick list', () => {

  const text = `STATE 2 delivered ten ideas.



1. Art heist in Venice

2. Family disappearance

3. Ponzi fraud ring



Pick a number, or describe a different topic.`

  const got = parseAgentChoices(text)

  assert.equal(got.items.length, 3)

  assert.equal(got.items[0].num, 1)

  assert.match(got.prompt, /Pick a number/i)

})



test('parseAgentChoices finds bullet list', () => {

  const text = `- Art heist in Venice

- Family disappearance

- Ponzi fraud ring



Pick a number.`

  const got = parseAgentChoices(text)

  assert.equal(got.items.length, 3)

  assert.equal(got.items[1].label, 'Family disappearance')

})



test('parseAgentChoices finds inline comma list', () => {

  const text = `STATE 2 delivered ten crime ideas across art heist, family disappearance, Ponzi fraud, bomb manhunt, prison escape, cyber bank theft, product tampering killings, espionage mole, armed train robbery, and state counterfeiting.



Pick a number, or describe a different topic.`

  const got = parseAgentChoices(text)

  assert.ok(got.items.length >= 8)

  assert.match(got.items[0].label, /art heist/i)

})



test('parseAgentChoices finds duration options', () => {

  const text = `Choose video length:



1. 30 seconds

2. 1 minute

3. 2 minutes



Pick a number.`

  const got = parseAgentChoices(text)

  assert.equal(got.items.length, 3)

  assert.match(got.title, /length/i)

})



test('stripNumberedListForChoices removes list body', () => {

  const choices = { items: [{ num: 1, label: 'A' }] }

  const out = stripNumberedListForChoices('Intro\n1. A\n2. B\nPick one', choices)

  assert.match(out, /Intro/)

  assert.doesNotMatch(out, /^1\. A/m)

})

