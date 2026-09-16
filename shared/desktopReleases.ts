import { desktopReleaseCatalog } from './desktopReleaseCatalog.ts'

export const DESKTOP_APP_VERSION = '0.1.0'

export type DesktopDownloadItem = {
  id: string
  label: string
  filename: string
  url: string
  available: boolean
}

export type DesktopRelease = {
  version: string
  latest: boolean
  releaseNotesUrl: string
  macos: DesktopDownloadItem[]
  windows: DesktopDownloadItem[]
  linux: DesktopDownloadItem[]
}

export type DesktopReleaseManifest = {
  version: string
  baseUrl: string
  releases: DesktopRelease[]
}

export const DEFAULT_RELEASES_BASE_URL = 'https://releases.soumtok.com/desktop/'

/** Same-origin download — never send users to releases.soumtok.com. */
export function desktopDownloadUrl(filename: string) {
  return `/api/desktop/download/${encodeURIComponent(filename)}`
}

function fileUrl(baseUrl: string, filename: string) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${base}${filename}`
}

export function buildDesktopReleaseManifest(
  baseUrl = DEFAULT_RELEASES_BASE_URL,
  version = DESKTOP_APP_VERSION,
  availableIds: Set<string> = new Set(['win-x64-user', 'win-x64-system', 'win-arm64-user', 'win-arm64-system', 'win-x64-zip']),
): DesktopReleaseManifest {
  const catalog = desktopReleaseCatalog(version)
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const mapItems = (items: ReturnType<typeof desktopReleaseCatalog>['windows']) =>
    items.map((item) => {
      const available = availableIds.has(item.id)
      return {
        id: item.id,
        label: item.label,
        filename: item.filename,
        url: available ? desktopDownloadUrl(item.filename) : fileUrl(normalizedBase, item.filename),
        available,
      }
    })

  return {
    version,
    baseUrl: normalizedBase,
    releases: [
      {
        version,
        latest: true,
        releaseNotesUrl: '/docs/changelog',
        windows: mapItems(catalog.windows),
        macos: mapItems(catalog.macos),
        linux: mapItems(catalog.linux),
      },
    ],
  }
}

export type DesktopPlatform = 'windows' | 'macos' | 'linux' | 'unknown'

export function detectDesktopPlatform(userAgent = '', platform = '') {
  const ua = userAgent.toLowerCase()
  const pf = platform.toLowerCase()
  if (/win/.test(pf) || ua.includes('windows')) return 'windows' as const
  if (/mac/.test(pf) || ua.includes('macintosh') || ua.includes('mac os')) return 'macos' as const
  if (/linux/.test(pf) || ua.includes('linux') || ua.includes('cros')) return 'linux' as const
  return 'unknown' as const
}

export function primaryDownloadForPlatform(manifest: DesktopReleaseManifest, platform: DesktopPlatform) {
  const release = manifest.releases.find((item) => item.latest) || manifest.releases[0]
  if (!release) return null
  const prefer = (items: DesktopDownloadItem[]) =>
    items.find((item) => item.available && item.id.includes('user')) ||
    items.find((item) => item.available) ||
    null

  if (platform === 'unknown') {
    for (const list of [release.windows, release.macos, release.linux]) {
      const hit = prefer(list)
      if (hit) return hit
    }
    return null
  }
  const list = platform === 'windows' ? release.windows : platform === 'macos' ? release.macos : release.linux
  return prefer(list)
}

export function primaryDownloadLabel(platform: DesktopPlatform) {
  if (platform === 'windows') return 'Download for Windows'
  if (platform === 'macos') return 'Download for macOS'
  if (platform === 'linux') return 'Download for Linux'
  return 'Download Soumtok Desktop'
}
