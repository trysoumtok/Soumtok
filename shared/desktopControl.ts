import {
  buildDesktopReleaseManifest,
  DEFAULT_RELEASES_BASE_URL,
  desktopDownloadUrl,
  type DesktopRelease,
  type DesktopReleaseManifest,
} from './desktopReleases.ts'
import { desktopReleaseCatalog } from './desktopReleaseCatalog.ts'

export type DesktopControlPolicy = {
  latestVersion: string
  minVersion: string
  forceUpdate: boolean
  disabled: boolean
  disabledMessage: string | null
  updateFeedUrl: string
  releasesBaseUrl: string
  releaseNotesUrl: string
  releasesManifestUrl: string | null
}

export type DesktopControlReleaseSpec = {
  version: string
  latest?: boolean
  releaseNotesUrl?: string
  windows?: Array<{ id: string; label: string; filename: string; available: boolean }>
  macos?: Array<{ id: string; label: string; filename: string; available: boolean }>
  linux?: Array<{ id: string; label: string; filename: string; available: boolean }>
}

export type DesktopControlFile = DesktopControlPolicy & {
  releases: DesktopControlReleaseSpec[] | null
  updatedAt?: string
}

export type DesktopClientConfig = DesktopControlPolicy & {
  currentVersion: string
  updateRequired: boolean
  updatedAt: string | null
}

const DEFAULT_POLICY: DesktopControlPolicy = {
  latestVersion: '0.1.0',
  minVersion: '0.1.0',
  forceUpdate: false,
  disabled: false,
  disabledMessage: null,
  updateFeedUrl: DEFAULT_RELEASES_BASE_URL,
  releasesBaseUrl: DEFAULT_RELEASES_BASE_URL,
  releaseNotesUrl: '/docs/changelog',
  releasesManifestUrl: null,
}

export function defaultDesktopControlFile(): DesktopControlFile {
  return { ...DEFAULT_POLICY, releases: null, updatedAt: new Date().toISOString() }
}

export function mergeDesktopControlPolicy(
  file: Partial<DesktopControlFile> | null | undefined,
  env: Record<string, string | undefined> = {},
): DesktopControlFile {
  const base = { ...defaultDesktopControlFile(), ...(file || {}) }
  if (env.DESKTOP_LATEST_VERSION?.trim()) base.latestVersion = env.DESKTOP_LATEST_VERSION.trim()
  if (env.DESKTOP_MIN_VERSION?.trim()) base.minVersion = env.DESKTOP_MIN_VERSION.trim()
  if (env.DESKTOP_FORCE_UPDATE === '1') base.forceUpdate = true
  if (env.DESKTOP_DISABLED === '1') base.disabled = true
  if (env.DESKTOP_DISABLED_MESSAGE?.trim()) base.disabledMessage = env.DESKTOP_DISABLED_MESSAGE.trim()
  if (env.SOUMTOK_UPDATE_URL?.trim()) {
    const url = env.SOUMTOK_UPDATE_URL.trim().replace(/\/?$/, '/')
    base.updateFeedUrl = url
    if (!env.SOUMTOK_RELEASES_URL?.trim()) base.releasesBaseUrl = url
  }
  if (env.SOUMTOK_RELEASES_URL?.trim()) {
    base.releasesBaseUrl = env.SOUMTOK_RELEASES_URL.trim().replace(/\/?$/, '/')
  }
  return base
}

function fileUrl(baseUrl: string, filename: string) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${base}${filename}`
}

export function buildManifestFromControl(control: DesktopControlFile): DesktopReleaseManifest {
  const baseUrl = control.releasesBaseUrl || DEFAULT_RELEASES_BASE_URL
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`

  if (control.releases?.length) {
    const releases: DesktopRelease[] = control.releases.map((spec) => ({
      version: spec.version,
      latest: spec.latest ?? false,
      releaseNotesUrl: spec.releaseNotesUrl || '/docs/changelog',
      windows: (spec.windows || []).map((item) => ({
        ...item,
        url: item.available ? desktopDownloadUrl(item.filename) : fileUrl(normalizedBase, item.filename),
      })),
      macos: (spec.macos || []).map((item) => ({
        ...item,
        url: item.available ? desktopDownloadUrl(item.filename) : fileUrl(normalizedBase, item.filename),
      })),
      linux: (spec.linux || []).map((item) => ({
        ...item,
        url: item.available ? desktopDownloadUrl(item.filename) : fileUrl(normalizedBase, item.filename),
      })),
    }))
    if (!releases.some((item) => item.latest) && releases[0]) releases[0].latest = true
    return { version: control.latestVersion, baseUrl: normalizedBase, releases }
  }

  const catalog = desktopReleaseCatalog(control.latestVersion)
  const available = new Set<string>()
  return buildDesktopReleaseManifest(normalizedBase, control.latestVersion, available)
}

export function parseVersionParts(version: string) {
  return version
    .trim()
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0)
}

export function compareVersions(a: string, b: string) {
  const aa = parseVersionParts(a)
  const bb = parseVersionParts(b)
  const len = Math.max(aa.length, bb.length)
  for (let i = 0; i < len; i += 1) {
    const diff = (aa[i] || 0) - (bb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function buildClientConfig(control: DesktopControlFile, currentVersion: string): DesktopClientConfig {
  const belowMin = compareVersions(currentVersion, control.minVersion) < 0
  const belowLatest = compareVersions(currentVersion, control.latestVersion) < 0
  return {
    latestVersion: control.latestVersion,
    minVersion: control.minVersion,
    forceUpdate: control.forceUpdate,
    disabled: control.disabled,
    disabledMessage: control.disabledMessage,
    updateFeedUrl: control.updateFeedUrl,
    releasesBaseUrl: control.releasesBaseUrl,
    releaseNotesUrl: control.releaseNotesUrl,
    releasesManifestUrl: control.releasesManifestUrl,
    currentVersion,
    updateRequired: belowMin || (control.forceUpdate && belowLatest),
    updatedAt: control.updatedAt || null,
  }
}
