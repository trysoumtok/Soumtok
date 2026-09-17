/** Mark-only asset (no wordmark text). Lockup is built in UI as mark + “Soumtok”. */
export const BRAND_MARK = '/images/soumtok-mark.png'
export const BRAND_MARK_DARK = '/images/soumtok-mark-dark.png'
export const BRAND_LOCKUP = '/images/soumtok-lockup.png'
export const BRAND_LOCKUP_DARK = '/images/soumtok-lockup-dark.png'
/** Upload to Google OAuth consent screen — readable on white Google UI. */
export const BRAND_OAUTH = '/images/soumtok-oauth.png'

export type BrandTheme = 'light' | 'dark'

export function brandMarkSrc(theme: BrandTheme, opts?: { onDarkSurface?: boolean }) {
  if (opts?.onDarkSurface || theme === 'dark') return BRAND_MARK
  return BRAND_MARK_DARK
}

export function brandLockupSrc(theme: BrandTheme, opts?: { onDarkSurface?: boolean }) {
  if (opts?.onDarkSurface || theme === 'dark') return BRAND_LOCKUP
  return BRAND_LOCKUP_DARK
}
