export const USERNAME_MIN = 3
export const USERNAME_MAX = 20

const RESERVED = new Set([
  'admin',
  'administrator',
  'account',
  'agents',
  'api',
  'assets',
  'auth',
  'billing',
  'canvases',
  'cursor',
  'dashboard',
  'docs',
  'help',
  'images',
  'integrations',
  'keys',
  'login',
  'me',
  'members',
  'mod',
  'moderator',
  'models',
  'null',
  'official',
  'onboarding',
  'plugins',
  'privacy',
  'root',
  'security',
  'settings',
  'signup',
  'soumtok',
  'spending',
  'staff',
  'studio',
  'support',
  'system',
  'team',
  'terms',
  'undefined',
  'usage',
  'www',
])

export function normalizeUsername(value: string) {
  return value.trim().replace(/\s/g, '')
}

export function usernameError(value: string) {
  const username = normalizeUsername(value)

  if (!username) return 'Choose a username'
  if (username.length < USERNAME_MIN) return 'Username must be at least 3 characters'
  if (username.length > USERNAME_MAX) return 'Username must be 20 characters or fewer'
  if (!/^[a-zA-Z]/.test(username)) return 'Username must start with a letter'
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return 'Use only letters, numbers, and underscore'
  if (/__/.test(username)) return 'Do not use two underscores in a row'
  if (username.endsWith('_')) return 'Username cannot end with an underscore'
  if (RESERVED.has(username.toLowerCase())) return 'That username is reserved'
  return null
}
