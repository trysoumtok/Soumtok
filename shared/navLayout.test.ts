import assert from 'node:assert/strict'
import test from 'node:test'
import { applyNavCollisionFix, cssLooksClosed, htmlHasCollidingNav } from './navLayout.ts'

test('detects a header that has both a hamburger and a link list', () => {
  assert.equal(
    htmlHasCollidingNav('<button class="nav-toggle"></button><ul class="nav-links">Home</ul>'),
    true,
  )
  assert.equal(htmlHasCollidingNav('<nav class="nav-links">Home</nav>'), false)
})

test('appends a desktop-hide hamburger rule that wins over a broken toggle', () => {
  const files = applyNavCollisionFix({
    'index.html': '<header><button class="nav-toggle"></button><ul class="nav-links"><li>Home</li></ul><a class="btn">Order Now</a></header>',
    'styles/main.css': '.nav-toggle { display: block; } .nav-links { display: flex; }',
  })
  const css = files['styles/main.css'] || ''
  assert.match(css, /soumtok-nav-fix/)
  assert.match(css, /\.nav-toggle[\s\S]*display:\s*none/)
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.nav-toggle[\s\S]*display:\s*inline-flex/)
  const again = applyNavCollisionFix(files)
  assert.equal((again['styles/main.css'] || '').split('/* soumtok-nav-fix:').length - 1, 1)
})

test('skips a truncated stylesheet so a live write is not wrapped mid-rule', () => {
  assert.equal(cssLooksClosed('.nav { display: flex'), false)
  const files = applyNavCollisionFix({
    'index.html': '<button class="nav-toggle"></button><div class="nav-links"></div>',
    'styles/main.css': '.nav { display: flex',
  })
  assert.doesNotMatch(files['styles/main.css'] || '', /soumtok-nav-fix/)
})
