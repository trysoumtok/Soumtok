const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

let electronApp = null
try {
  electronApp = require('electron').app
} catch {
  /* node script / test */
}

const OPEN_VSX = 'https://open-vsx.org/api'
const { galleryPopular, gallerySearch } = require('./vscodeGallery')
const { fetchExtensionDetailFromGallery } = require('./vscodeGallery')
const { galleryPopular: openVsxPopular, gallerySearch: openVsxSearch } = require('./openVsxGallery')

const { userScopeRoot, activeUserKey } = require('./userScope')

/** Per-account extension store on this device: ~/.soumtok/ide/users/<account>/extensions */
function soumtokIdeRoot() {
  return userScopeRoot()
}

function extensionsDataRoot() {
  return soumtokIdeRoot()
}

function extensionsRoot() {
  const root = path.join(soumtokIdeRoot(), 'extensions')
  fs.mkdirSync(root, { recursive: true })
  return root
}

/** `extensions.json` belongs to VS Code's own extension scanner — ours must not shadow it. */
const REGISTRY_FILE = 'soumtok-extensions.json'
const LEGACY_REGISTRY_FILE = 'extensions.json'

/**
 * A VSIX holds the extension under `extension/`, but VS Code requires `package.json` at the
 * root of the install folder, so the payload is lifted one level up.
 */
function flattenVsixLayout(dir) {
  const inner = path.join(dir, 'extension')
  if (fs.existsSync(path.join(dir, 'package.json'))) return
  if (!fs.existsSync(path.join(inner, 'package.json'))) return
  for (const entry of fs.readdirSync(inner)) {
    const target = path.join(dir, entry)
    try {
      fs.rmSync(target, { recursive: true, force: true })
      fs.renameSync(path.join(inner, entry), target)
    } catch {
      /* keep going: a partially lifted extension still beats none */
    }
  }
  fs.rmSync(inner, { recursive: true, force: true })
}

/** Repairs installs made before the layout fix and drops the registry file that shadowed VS Code's. */
function migrateExtensionsLayout() {
  const root = path.join(soumtokIdeRoot(), 'extensions')
  if (!fs.existsSync(root)) return
  const legacy = path.join(root, LEGACY_REGISTRY_FILE)
  try {
    const data = JSON.parse(fs.readFileSync(legacy, 'utf8'))
    if (Array.isArray(data) && data.every((r) => r && (r.scope === 'device' || r.scope === 'account')))
      fs.rmSync(legacy, { force: true })
  } catch {
    /* absent or VS Code's own file — leave it alone */
  }
  let entries = []
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.isDirectory()) flattenVsixLayout(path.join(root, entry.name))
  }
}

function extensionInstallDirName(publisher, name, version) {
  const pub = String(publisher || '').trim()
  const extName = String(name || '').trim()
  const ver = String(version || '').trim()
  return `${pub}.${extName}-${ver}`
}

function readExtensionsRegistry() {
  const file = path.join(extensionsRoot(), REGISTRY_FILE)
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function writeExtensionsRegistry(entries) {
  const file = path.join(extensionsRoot(), REGISTRY_FILE)
  fs.writeFileSync(file, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
}

function syncExtensionsRegistry(scanned) {
  const now = new Date().toISOString()
  const prev = readExtensionsRegistry()
  const prevById = new Map(prev.map((r) => [String(r.id || '').toLowerCase(), r]))
  const entries = (scanned || []).map((row) => {
    const id = `${row.publisher}.${row.name}`
    const old = prevById.get(id.toLowerCase())
    return {
      id,
      publisher: row.publisher,
      name: row.name,
      version: row.version,
      path: row.path,
      scope: 'account',
      installedAt: old?.installedAt || now,
      updatedAt: now,
    }
  })
  writeExtensionsRegistry(entries)
  return entries
}

function extensionsStorageInfo() {
  const root = extensionsRoot()
  return {
    scope: 'account',
    root,
    ideRoot: soumtokIdeRoot(),
    accountKey: activeUserKey(),
    registryPath: path.join(root, REGISTRY_FILE),
    note: 'Extensions are installed for your Soumtok account on this device, across all your projects. Other accounts signing in here do not see them.',
  }
}

function pruneOtherExtensionVersions(publisher, name, keepDir) {
  const root = extensionsRoot()
  const prefix = `${String(publisher || '').toLowerCase()}.${String(name || '').toLowerCase()}-`
  let entries = []
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  const keep = path.resolve(keepDir)
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!entry.name.toLowerCase().startsWith(prefix)) continue
    const full = path.resolve(path.join(root, entry.name))
    if (full === keep) continue
    try {
      fs.rmSync(full, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

function unzipVsix(vsixPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  if (process.platform === 'win32') {
    const zipPath = vsixPath.toLowerCase().endsWith('.zip') ? vsixPath : `${vsixPath}.zip`
    let copied = false
    if (zipPath !== vsixPath) {
      fs.copyFileSync(vsixPath, zipPath)
      copied = true
    }
    try {
      const ps = `$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
      const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true })
      if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'Expand-Archive failed').slice(0, 400))
    } finally {
      if (copied) {
        try {
          fs.unlinkSync(zipPath)
        } catch {
          /* ignore */
        }
      }
    }
    return
  }
  const r = spawnSync('unzip', ['-o', '-q', vsixPath, '-d', destDir], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error((r.stderr || 'unzip failed').slice(0, 400))
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Open VSX ${res.status}`)
  return res.json()
}

function tempDir() {
  if (electronApp?.getPath) {
    try {
      return electronApp.getPath('temp')
    } catch {
      /* app not ready */
    }
  }
  return os.tmpdir()
}

/** VS Marketplace browse (same API as VS Code). Install uses Open VSX VSIX. */
async function popularOpenVsx(pageSize = 50, pageNumber = 1) {
  try {
    const { extensions } = await galleryPopular(pageSize, pageNumber)
    return extensions
  } catch {
    const { extensions } = await openVsxPopular(pageSize, pageNumber)
    return extensions
  }
}

async function searchOpenVsx(query, pageSize = 48, pageNumber = 1) {
  try {
    const { extensions } = await gallerySearch(query, pageSize, pageNumber)
    return extensions
  } catch {
    const { extensions } = await openVsxSearch(query, pageSize, pageNumber)
    return extensions
  }
}

async function fetchExtensionDetail(publisher, name) {
  const pub = String(publisher || '').trim()
  const extName = String(name || '').trim()
  try {
    return await fetchExtensionDetailFromGallery(pub, extName)
  } catch {
    /* Open VSX fallback for detail body */
  }
  const data = await fetchJson(`${OPEN_VSX}/${encodeURIComponent(pub)}/${encodeURIComponent(extName)}`)
  let readme = ''
  const version = data.version
  if (version) {
    try {
      const readmeUrl = `${OPEN_VSX}/${encodeURIComponent(pub)}/${encodeURIComponent(extName)}/${encodeURIComponent(version)}/file/README.md`
      const res = await fetch(readmeUrl)
      if (res.ok) readme = await res.text()
    } catch {
      /* optional */
    }
  }
  return {
    id: `${data.namespace || pub}.${data.name || extName}`,
    publisher: data.namespace || pub,
    name: data.name || extName,
    displayName: data.displayName || data.name || extName,
    description: data.description || '',
    version: data.version || '',
    downloadCount: data.downloadCount || 0,
    averageRating: data.averageRating || 0,
    publishedBy: data.publishedBy?.displayName || data.namespace || pub,
    categories: data.categories || [],
    license: data.license || '',
    homepage: data.files?.homepage || '',
    repository: data.files?.repository || '',
    marketplaceUrl: `https://open-vsx.org/extension/${encodeURIComponent(data.namespace || pub)}/${encodeURIComponent(data.name || extName)}`,
    iconUrl: data.files?.icon || '',
    readme: readme.slice(0, 48_000),
  }
}

/**
 * Extensions that ship native binaries publish one VSIX per platform, and the default Open VSX
 * entry can be any of them (Claude Code answers with alpine-arm64), which installs an extension
 * that cannot run here. This asks for the build matching the machine.
 */
function openVsxTargetPlatform() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  if (process.platform === 'win32') return `win32-${arch}`
  if (process.platform === 'darwin') return `darwin-${arch}`
  if (process.platform === 'linux') return `linux-${arch}`
  return ''
}

async function openVsxSource(publisher, name) {
  const target = openVsxTargetPlatform()
  const urls = []
  if (target) urls.push(`${OPEN_VSX}/${encodeURIComponent(publisher)}/${encodeURIComponent(name)}/${target}/latest`)
  urls.push(`${OPEN_VSX}/${encodeURIComponent(publisher)}/${encodeURIComponent(name)}`)
  for (const url of urls) {
    try {
      const data = await fetchJson(url)
      if (!data?.files?.download || !data.version) continue
      return {
        publisher: data.namespace || publisher,
        name: data.name || name,
        version: data.version,
        displayName: data.displayName || name,
        description: data.description || '',
        download: data.files.download,
        source: 'Open VSX',
      }
    } catch {
      /* try the next candidate */
    }
  }
  return null
}

/**
 * Many extensions are only published to the VS Marketplace, which is also where Soumtok browses,
 * so an install falls back to the gallery's own VSIX asset for this platform.
 */
async function marketplaceSource(publisher, name) {
  const { galleryExtensionRawById } = require('./vscodeGallery')
  const raw = await galleryExtensionRawById(`${publisher}.${name}`).catch(() => null)
  if (!raw) return null
  const target = openVsxTargetPlatform()
  const versions = raw.versions || []
  const pick =
    versions.find((v) => v.targetPlatform === target) ||
    versions.find((v) => !v.targetPlatform) ||
    versions[0] ||
    null
  const download = (pick?.files || []).find(
    (f) => f.assetType === 'Microsoft.VisualStudio.Services.VSIXPackage',
  )?.source
  if (!pick?.version || !download) return null
  return {
    publisher: raw.publisher?.publisherName || publisher,
    name: raw.extensionName || name,
    version: pick.version,
    displayName: raw.displayName || name,
    description: raw.shortDescription || '',
    download,
    source: 'VS Marketplace',
  }
}

const sourceCache = new Map()
const SOURCE_TTL_MS = 10 * 60 * 1000

/** The VSIX Soumtok can actually install here: right platform, real download URL. */
async function resolveVsixSource(publisher, name, { fresh = false } = {}) {
  const key = `${String(publisher).toLowerCase()}.${String(name).toLowerCase()}`
  const hit = sourceCache.get(key)
  if (!fresh && hit && Date.now() - hit.at < SOURCE_TTL_MS) return hit.value
  const value = (await openVsxSource(publisher, name)) || (await marketplaceSource(publisher, name))
  sourceCache.set(key, { at: Date.now(), value })
  return value
}

/** Latest version installable on this machine, for accurate update prompts. */
async function latestInstallableVersion(publisher, name) {
  const source = await resolveVsixSource(publisher, name).catch(() => null)
  return source?.version || ''
}

async function extensionMeta(publisher, name) {
  const source = await resolveVsixSource(publisher, name, { fresh: true })
  if (!source) throw new Error('No VSIX available for this platform on Open VSX or the VS Marketplace')
  return source
}

function readInstalledOne(dir) {
  const { readExtensionPackage, resolveIconPath } = require('./extensionActivity')
  const parsed = readExtensionPackage(dir)
  if (!parsed?.pkg) return null
  const { pkg, pkgRoot } = parsed
  const iconPath = resolveIconPath(pkgRoot, pkg.icon)
  return {
    id: `${pkg.publisher}.${pkg.name}`,
    publisher: pkg.publisher,
    name: pkg.name,
    version: pkg.version,
    displayName: pkg.displayName || pkg.name,
    description: pkg.description || '',
    path: dir,
    iconPath,
  }
}

function listInstalledExtensions() {
  const root = extensionsRoot()
  migrateExtensionsLayout()
  const out = []
  let entries = []
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const row = readInstalledOne(path.join(root, entry.name))
    if (row) out.push(row)
  }
  const sorted = out.sort((a, b) => a.displayName.localeCompare(b.displayName))
  syncExtensionsRegistry(sorted)
  return sorted
}

function parseVersionParts(value) {
  return String(value || '')
    .replace(/^[^\d]*/, '')
    .split('.')
    .map((p) => Number.parseInt(p, 10) || 0)
}

/** True when the host's VS Code version satisfies the extension's minimum `engines.vscode`. */
function engineSatisfied(engineRange, hostVersion) {
  const range = String(engineRange || '').trim()
  if (!range || range === '*' || !hostVersion) return true
  const [needMajor, needMinor] = parseVersionParts(range)
  const [haveMajor, haveMinor] = parseVersionParts(hostVersion)
  if (haveMajor !== needMajor) return haveMajor > needMajor
  return haveMinor >= needMinor
}

/**
 * A download that unpacks is not the same as a working install: VS Code needs the manifest at the
 * folder root and refuses extensions built for a newer editor, so both are checked here and the
 * folder is removed when it cannot run.
 */
function validateInstalledExtension(dir) {
  const manifestPath = path.join(dir, 'package.json')
  let pkg = null
  try {
    pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch {
    fs.rmSync(dir, { recursive: true, force: true })
    throw new Error('Downloaded package is not a valid extension (no manifest)')
  }
  if (!pkg.name || !pkg.publisher || !pkg.version) {
    fs.rmSync(dir, { recursive: true, force: true })
    throw new Error('Extension manifest is missing publisher, name, or version')
  }
  const hostVersion = require('./extensionHostRuntime').hostVsCodeVersion()
  if (!engineSatisfied(pkg.engines?.vscode, hostVersion)) {
    fs.rmSync(dir, { recursive: true, force: true })
    throw new Error(`Needs VS Code ${pkg.engines.vscode}, but the extension host is ${hostVersion}`)
  }
  return pkg
}

async function installFromOpenVsx(publisher, name) {
  const meta = await extensionMeta(publisher, name)
  const tmp = path.join(tempDir(), `soumtok-${meta.publisher}.${meta.name}-${meta.version}.vsix`)
  const res = await fetch(meta.download)
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(tmp, buf)
  const dest = path.join(extensionsRoot(), extensionInstallDirName(meta.publisher, meta.name, meta.version))
  try {
    fs.rmSync(dest, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  unzipVsix(tmp, dest)
  flattenVsixLayout(dest)
  try {
    fs.unlinkSync(tmp)
  } catch {
    /* ignore */
  }
  validateInstalledExtension(dest)
  pruneOtherExtensionVersions(meta.publisher, meta.name, dest)
  const extension = readInstalledOne(dest)
  const installed = listInstalledExtensions()
  const store = extensionsStorageInfo()
  return {
    ok: true,
    extension,
    installedCount: installed.length,
    storage: store,
    source: meta.source,
    version: meta.version,
    note: `Installed ${meta.version} from ${meta.source} at ${store.root}`,
  }
}

function extensionHostNote() {
  return extensionsStorageInfo().note
}

function uninstallExtension(installPath) {
  const p = String(installPath || '')
  const root = extensionsRoot()
  if (!p.startsWith(root)) throw new Error('Invalid extension path')
  fs.rmSync(p, { recursive: true, force: true })
  syncExtensionsRegistry(listInstalledExtensions())
  return { ok: true, storage: extensionsStorageInfo() }
}

function readWorkspaceRecommendations(workspaceRoot) {
  if (!workspaceRoot) return []
  const file = path.join(workspaceRoot, '.vscode', 'extensions.json')
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return (data.recommendations || []).map(String)
  } catch {
    return []
  }
}

module.exports = {
  searchOpenVsx,
  popularOpenVsx,
  fetchExtensionDetail,
  installFromOpenVsx,
  listInstalledExtensions,
  uninstallExtension,
  readWorkspaceRecommendations,
  extensionsRoot,
  extensionsStorageInfo,
  migrateExtensionsLayout,
  resolveVsixSource,
  latestInstallableVersion,
  soumtokIdeRoot,
}
