import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GITHUB_APP_INSTALL_URL,
  GITHUB_APP_SLUG,
  SITE_GITHUB_REPO,
  githubAppInstallUrl,
  githubOAuthConnectionsUrl,
  resolveGithubGrantReposUrl,
} from './githubApp.ts'

test('githubAppInstallUrl uses soumtok slug by default', () => {
  assert.equal(GITHUB_APP_SLUG, 'soumtok')
  assert.equal(githubAppInstallUrl(), 'https://github.com/apps/soumtok/installations/new')
  assert.equal(GITHUB_APP_INSTALL_URL, '/api/github/grant')
})

test('resolveGithubGrantReposUrl falls back to OAuth when app is unavailable', () => {
  const oauth = resolveGithubGrantReposUrl({
    appSlug: 'soumtok',
    clientId: 'Ov23liSgwpYpAfM91NLj',
    appInstallAvailable: false,
  })
  assert.equal(oauth.kind, 'oauth')
  assert.equal(oauth.url, githubOAuthConnectionsUrl('Ov23liSgwpYpAfM91NLj'))
})

test('resolveGithubGrantReposUrl uses GitHub App when available', () => {
  const app = resolveGithubGrantReposUrl({
    appSlug: 'soumtok',
    clientId: 'Ov23liSgwpYpAfM91NLj',
    appInstallAvailable: true,
  })
  assert.equal(app.kind, 'app')
  assert.equal(app.url, githubAppInstallUrl('soumtok'))
})

test('SITE_GITHUB_REPO points at trysoumtok/Soumtok', () => {
  assert.equal(SITE_GITHUB_REPO, 'https://github.com/trysoumtok/Soumtok')
})
