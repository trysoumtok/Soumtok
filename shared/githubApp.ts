/** GitHub App slug for repo access (create at /api/setup/github/start). */
export const GITHUB_APP_SLUG = (typeof process !== 'undefined' && process.env?.GITHUB_APP_SLUG?.trim()) || 'sown'

export function githubAppInstallUrl() {
  return `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`
}
