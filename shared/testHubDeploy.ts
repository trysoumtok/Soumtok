const SLUG_RESERVED = new Set([
  'admin',
  'api',
  'assets',
  'auth',
  'billing',
  'dashboard',
  'docs',
  'login',
  'models',
  'onboarding',
  'settings',
  'signup',
  'soumtok',
  'studio',
  'support',
  't',
  'terms',
  'test-hub',
  'usage',
  'www',
])

export function normalizeTestHubSlug(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function suggestTestHubSlug(title: string) {
  const slug = normalizeTestHubSlug(title)
  if (slug.length >= 3) return slug.slice(0, 40)
  return `demo-${Date.now().toString(36).slice(-6)}`
}

export function testHubSlugError(value: string) {
  const slug = normalizeTestHubSlug(value)
  if (!slug) return 'Choose a slug for the link'
  if (slug.length < 3) return 'Slug must be at least 3 characters'
  if (slug.length > 40) return 'Slug must be 40 characters or fewer'
  if (!/^[a-z0-9]/.test(slug)) return 'Slug must start with a letter or number'
  if (!/^[a-z0-9-]+$/.test(slug)) return 'Use only lowercase letters, numbers, and hyphens'
  if (SLUG_RESERVED.has(slug)) return 'That slug is reserved'
  return null
}

export function testHubSharePath(slug: string) {
  return `/t/${normalizeTestHubSlug(slug)}/`
}

export const SHARE_TTL_MIN_MS = 30 * 60_000
export const SHARE_TTL_MAX_MS = 30 * 24 * 60 * 60_000
export const SHARE_TTL_DEFAULT_MINUTES = 30

/** User-selectable share durations — max 30 days, no forever. */
export const SHARE_TTL_OPTIONS = [
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 360, label: '6 hours' },
  { minutes: 1440, label: '24 hours' },
  { minutes: 10080, label: '7 days' },
  { minutes: 43200, label: '30 days' },
] as const

export function clampShareTtlMinutes(input: unknown) {
  const n = Number(input)
  if (!Number.isFinite(n)) return SHARE_TTL_DEFAULT_MINUTES
  const minMinutes = SHARE_TTL_MIN_MS / 60_000
  const maxMinutes = SHARE_TTL_MAX_MS / 60_000
  return Math.min(maxMinutes, Math.max(minMinutes, Math.round(n)))
}

export function shareTtlMsFromMinutes(minutes: number) {
  return clampShareTtlMinutes(minutes) * 60_000
}

export function formatShareDuration(minutes: number) {
  const m = clampShareTtlMinutes(minutes)
  if (m < 60) return `${m} minutes`
  if (m < 1440) {
    const h = Math.round(m / 60)
    return `${h} hour${h === 1 ? '' : 's'}`
  }
  const d = Math.round(m / 1440)
  return `${d} day${d === 1 ? '' : 's'}`
}
