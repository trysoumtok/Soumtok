import fs, { createReadStream, existsSync, statSync } from 'fs'
import path from 'path'
import type { Hono } from 'hono'
import {
  buildClientConfig,
  buildManifestFromControl,
  defaultDesktopControlFile,
  mergeDesktopControlPolicy,
  type DesktopControlFile,
  type DesktopReleaseManifest,
} from '../shared/desktopControl.ts'
import type { DesktopDownloadItem } from '../shared/desktopReleases.ts'
import { hasBunny } from './env.ts'
import { downloadFromBunny, existsOnBunny } from './storage.ts'

const BUNNY_AVAIL_CACHE_MS = 5 * 60_000
const bunnyAvailCache = new Map<string, { at: number; ok: boolean }>()

const CONTROL_PATH = path.resolve(process.cwd(), 'data/desktop-control.json')
const RELEASE_DIRS = [
  path.resolve(process.cwd(), 'desktop/release'),
  path.resolve(process.cwd(), 'desktop/release/stage-linux'),
]
const BUNNY_RELEASE_PREFIX = 'desktop/releases/'

function readControlFile(): DesktopControlFile {
  try {
    if (!fs.existsSync(CONTROL_PATH)) return defaultDesktopControlFile()
    return mergeDesktopControlPolicy(JSON.parse(fs.readFileSync(CONTROL_PATH, 'utf8')), process.env)
  } catch {
    return mergeDesktopControlPolicy(defaultDesktopControlFile(), process.env)
  }
}

function safeReleaseFilename(name: string) {
  const base = path.basename(name || '')
  if (!/^Soumtok[\w.-]+\.(exe|zip|dmg|deb|AppImage)$/i.test(base)) return null
  return base
}

function findLocalRelease(filename: string) {
  for (const dir of RELEASE_DIRS) {
    const full = path.join(dir, filename)
    if (existsSync(full)) return full
  }
  return null
}

function releaseContentType(filename: string) {
  if (filename.endsWith('.zip')) return 'application/zip'
  if (filename.endsWith('.dmg')) return 'application/x-apple-diskimage'
  if (filename.endsWith('.deb')) return 'application/vnd.debian.binary-package'
  if (filename.endsWith('.AppImage')) return 'application/x-executable'
  return 'application/octet-stream'
}

function mapDownloadUrl(origin: string, item: DesktopDownloadItem) {
  if (!item.available) return item
  return { ...item, url: `${origin}/api/desktop/download/${encodeURIComponent(item.filename)}` }
}

function withServeUrls(manifest: DesktopReleaseManifest, origin: string): DesktopReleaseManifest {
  return {
    ...manifest,
    releases: manifest.releases.map((release) => ({
      ...release,
      windows: release.windows.map((item) => mapDownloadUrl(origin, item)),
      macos: release.macos.map((item) => mapDownloadUrl(origin, item)),
      linux: release.linux.map((item) => mapDownloadUrl(origin, item)),
    })),
  }
}

async function releaseFileOnBunny(filename: string) {
  const cached = bunnyAvailCache.get(filename)
  if (cached && Date.now() - cached.at < BUNNY_AVAIL_CACHE_MS) return cached.ok
  try {
    const ok = await existsOnBunny(`${BUNNY_RELEASE_PREFIX}${filename}`)
    bunnyAvailCache.set(filename, { at: Date.now(), ok })
    return ok
  } catch {
    bunnyAvailCache.set(filename, { at: Date.now(), ok: false })
    return false
  }
}

async function enrichReleaseAvailability(manifest: DesktopReleaseManifest): Promise<DesktopReleaseManifest> {
  const mapItems = async (items: DesktopDownloadItem[]) =>
    Promise.all(
      items.map(async (item) => {
        if (item.available) return item
        if (findLocalRelease(item.filename)) return { ...item, available: true }
        if (hasBunny() && (await releaseFileOnBunny(item.filename))) return { ...item, available: true }
        return item
      }),
    )

  const releases = await Promise.all(
    manifest.releases.map(async (release) => ({
      ...release,
      windows: await mapItems(release.windows),
      macos: await mapItems(release.macos),
      linux: await mapItems(release.linux),
    })),
  )

  return { ...manifest, releases }
}

export function registerDesktopControl(app: Hono) {
  app.get('/api/desktop/config', (c) => {
    const control = readControlFile()
    const version = c.req.header('X-Soumtok-Desktop-Version')?.trim() || '0.0.0'
    return c.json(buildClientConfig(control, version), 200, { 'Cache-Control': 'public, max-age=60' })
  })

  app.get('/api/desktop/releases', async (c) => {
    const control = readControlFile()
    const manifest = await enrichReleaseAvailability(buildManifestFromControl(control))
    const origin = new URL(c.req.url).origin
    return c.json(withServeUrls(manifest, origin), 200, { 'Cache-Control': 'public, max-age=300' })
  })

  app.get('/api/desktop/download/:filename', async (c) => {
    const filename = safeReleaseFilename(c.req.param('filename'))
    if (!filename) return c.json({ error: 'Invalid file' }, 400)

    const local = findLocalRelease(filename)
    if (local) {
      const size = statSync(local).size
      return new Response(createReadStream(local) as unknown as BodyInit, {
        headers: {
          'Content-Type': releaseContentType(filename),
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(size),
          'Cache-Control': 'public, max-age=86400',
        },
      })
    }

    if (hasBunny()) {
      try {
        const stored = await downloadFromBunny(`${BUNNY_RELEASE_PREFIX}${filename}`)
        return new Response(stored.bytes, {
          headers: {
            'Content-Type': releaseContentType(filename),
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'public, max-age=86400',
          },
        })
      } catch {
        /* not on Bunny */
      }
    }

    return c.json({ error: 'Installer not found. Try again in a minute or contact support@soumtok.com.' }, 404)
  })
}
