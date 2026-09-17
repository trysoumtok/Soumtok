import assert from 'node:assert/strict'
import test from 'node:test'
import { GITHUB_APP_INSTALL_URL, GITHUB_APP_SLUG, SITE_GITHUB_REPO, githubAppInstallUrl } from './githubApp.ts'

test('githubAppInstallUrl uses soumtok slug by default', () => {
  assert.equal(GITHUB_APP_SLUG, 'soumtok')
  assert.equal(githubAppInstallUrl(), 'https://github.com/apps/soumtok/installations/new')
  assert.equal(GITHUB_APP_INSTALL_URL, githubAppInstallUrl())
})

test('SITE_GITHUB_REPO points at trysoumtok/Soumtok', () => {
  assert.equal(SITE_GITHUB_REPO, 'https://github.com/trysoumtok/Soumtok')
})
