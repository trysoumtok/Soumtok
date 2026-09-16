/**
 * Visual Studio Marketplace — same gallery API VS Code uses for browse/stats/icons.
 * Install/uninstall still uses Open VSX VSIX in extensionsMarket.js.
 */
const GALLERY_URL =
  'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=7.1-preview.1'
const GALLERY_FLAGS = 914
const VSCODE_TARGET = 'Microsoft.VisualStudio.Code'
const { buildFeatureSections, issuesUrlFromRepo, normalizeRepoUrl } = require('./extensionContributes')
const { publisherVerified } = require('../shared/publisherVerified')

async function postGallery(filter) {
  const body = { filters: [filter], flags: GALLERY_FLAGS }
  const res = await fetch(GALLERY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json;api-version=7.1-preview.1',
      'X-Market-Client-Id': 'Soumtok.desktop',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`VS Marketplace ${res.status}`)
  const data = await res.json()
  if (data.errorCode != null) throw new Error(data.message || 'Gallery query failed')
  const result = data.results?.[0] || {}
  const totalMeta = result.resultMetadata?.find((m) => m.metadataType === 'ResultCount')
  const totalItem = totalMeta?.metadataItems?.find((m) => m.name === 'TotalCount')
  return {
    extensions: (result.extensions || []).map(mapGalleryExtension),
    total: totalItem?.count ?? result.extensions?.length ?? 0,
  }
}

function galleryStats(ext, ver) {
  const stats = ext.statistics?.length ? ext.statistics : ver?.statistics || []
  const install = stats.find((s) => s.statisticName === 'install')?.value || 0
  const averageRating = stats.find((s) => s.statisticName === 'averagerating')?.value || 0
  const ratingCount = stats.find((s) => s.statisticName === 'ratingcount')?.value || 0
  return { install, averageRating, ratingCount }
}

function fileAsset(files, assetType) {
  return files.find((f) => f.assetType === assetType)?.source || ''
}

function mapGalleryExtension(ext) {
  const publisher = ext.publisher?.publisherName || ''
  const name = ext.extensionName || ''
  const ver = ext.versions?.[0]
  const { install, averageRating, ratingCount } = galleryStats(ext, ver)
  const files = ver?.files || []
  const iconUrl = fileAsset(files, 'Microsoft.VisualStudio.Services.Icons.Default')
  return {
    id: `${publisher}.${name}`,
    publisher,
    name,
    version: ver?.version || '',
    displayName: ext.displayName || name,
    description: ext.shortDescription || '',
    downloadCount: install,
    averageRating,
    ratingCount,
    iconUrl,
    publisherDisplayName: ext.publisher?.displayName || publisher,
    verified: publisherVerified(ext.publisher),
    marketplaceUrl: `https://marketplace.visualstudio.com/items?itemName=${encodeURIComponent(publisher)}.${encodeURIComponent(name)}`,
    detailAssetUrl: fileAsset(files, 'Microsoft.VisualStudio.Services.Content.Details'),
    changelogAssetUrl: fileAsset(files, 'Microsoft.VisualStudio.Services.Content.Changelog'),
    licenseAssetUrl: fileAsset(files, 'Microsoft.VisualStudio.Services.Content.License'),
    categories: (ext.categories || []).map((c) => c.name || c).filter(Boolean),
  }
}

async function galleryPopular(pageSize = 50, pageNumber = 1, sortBy = 4, sortOrder = 2) {
  return postGallery({
    criteria: [{ filterType: 8, value: VSCODE_TARGET }],
    pageNumber: Math.max(1, pageNumber),
    pageSize: Math.min(Math.max(pageSize, 1), 100),
    sortBy,
    sortOrder,
  })
}

async function galleryFeatured(pageSize = 50, pageNumber = 1) {
  return postGallery({
    criteria: [
      { filterType: 8, value: VSCODE_TARGET },
      { filterType: 9, value: 'featured' },
    ],
    pageNumber: Math.max(1, pageNumber),
    pageSize: Math.min(Math.max(pageSize, 1), 100),
    sortBy: 4,
    sortOrder: 2,
  })
}

async function galleryRecent(pageSize = 50, pageNumber = 1) {
  return postGallery({
    criteria: [{ filterType: 8, value: VSCODE_TARGET }],
    pageNumber: Math.max(1, pageNumber),
    pageSize: Math.min(Math.max(pageSize, 1), 100),
    sortBy: 6,
    sortOrder: 2,
  })
}

async function gallerySearch(query, pageSize = 48, pageNumber = 1) {
  const q = String(query || '').trim()
  if (!q) return { extensions: [], total: 0 }
  return postGallery({
    criteria: [
      { filterType: 10, value: q.slice(0, 200) },
      { filterType: 8, value: VSCODE_TARGET },
    ],
    pageNumber: Math.max(1, pageNumber),
    pageSize: Math.min(Math.max(pageSize, 1), 100),
    sortBy: 0,
    sortOrder: 0,
  })
}

async function galleryExtensionById(extensionId) {
  const id = String(extensionId || '').trim()
  if (!id) return null
  const { extensions } = await postGallery({
    criteria: [{ filterType: 7, value: id }],
    pageNumber: 1,
    pageSize: 1,
  })
  return extensions[0] || null
}

async function galleryExtensionRawById(extensionId) {
  const id = String(extensionId || '').trim()
  if (!id) return null
  const body = {
    filters: [{ criteria: [{ filterType: 7, value: id }], pageNumber: 1, pageSize: 1 }],
    flags: GALLERY_FLAGS,
  }
  const res = await fetch(GALLERY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json;api-version=7.1-preview.1',
      'X-Market-Client-Id': 'Soumtok.desktop',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.results?.[0]?.extensions?.[0] || null
}

async function fetchTextAsset(url) {
  if (!url) return ''
  try {
    const res = await fetch(url)
    if (!res.ok) return ''
    return (await res.text()).slice(0, 96_000)
  } catch {
    return ''
  }
}

async function fetchExtensionDetailFromGallery(publisher, name) {
  const id = `${publisher}.${name}`
  const raw = await galleryExtensionRawById(id)
  if (!raw) throw new Error('Extension not found on VS Marketplace')
  const row = mapGalleryExtension(raw)
  const ver = raw.versions?.[0]
  const files = ver?.files || []
  const manifestUrl = fileAsset(files, 'Microsoft.VisualStudio.Code.Manifest')
  const [readme, changelog, manifestText, licenseText] = await Promise.all([
    fetchTextAsset(row.detailAssetUrl),
    fetchTextAsset(row.changelogAssetUrl),
    fetchTextAsset(manifestUrl),
    fetchTextAsset(row.licenseAssetUrl),
  ])
  let license = licenseText.length < 120 ? licenseText.trim() : row.license || ''
  let repository = ''
  let homepage = ''
  let engines = ''
  let featureSections = []
  let bugsUrl = ''
  let extensionPack = []
  try {
    const pkg = JSON.parse(manifestText)
    repository = normalizeRepoUrl(
      typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || '',
    )
    homepage = pkg.homepage || ''
    bugsUrl = pkg.bugs?.url || issuesUrlFromRepo(repository)
    engines = pkg.engines?.vscode ? String(pkg.engines.vscode) : ''
    featureSections = buildFeatureSections(pkg)
    extensionPack = (pkg.extensionPack || []).map(String)
  } catch {
    /* optional manifest */
  }
  const licenseUrl = row.licenseAssetUrl || ''
  const issuesUrl = bugsUrl || issuesUrlFromRepo(repository)
  const pub = raw.publisher || {}
  const publisherPageUrl = `https://marketplace.visualstudio.com/publishers/${encodeURIComponent(row.publisher)}`
  const reviewsUrl = `${row.marketplaceUrl}&ssr=false#review-details`
  const openVsxUrl = `https://open-vsx.org/extension/${encodeURIComponent(row.publisher)}/${encodeURIComponent(row.name)}`
  return {
    id: row.id,
    publisher: row.publisher,
    name: row.name,
    displayName: row.displayName,
    description: row.description,
    version: row.version,
    downloadCount: row.downloadCount,
    averageRating: row.averageRating,
    ratingCount: row.ratingCount,
    publishedBy: row.publisherDisplayName,
    publisherDomain: pub.domain || '',
    categories: row.categories,
    license,
    marketplaceUrl: row.marketplaceUrl,
    publisherPageUrl,
    reviewsUrl,
    openVsxUrl,
    iconUrl: row.iconUrl,
    readme,
    changelog,
    lastUpdated: ver?.lastUpdated || '',
    repository: String(repository || '').replace(/^git\+/, ''),
    homepage,
    engines,
    featureSections,
    extensionPack,
    verified: publisherVerified(pub),
    licenseUrl,
    issuesUrl,
    publishedDate: ver?.lastUpdated || '',
  }
}

async function browseGallery(options = {}) {
  const mode = String(options.mode || 'popular')
  const pageSize = options.pageSize || 50
  const pageNumber = options.pageNumber || 1
  const query = String(options.query || '').trim()
  if (query) return gallerySearch(query, pageSize, pageNumber)
  const sortKey = String(options.sort || 'installs')
  const sortMap = {
    installs: [4, 2],
    rating: [5, 2],
    published: [6, 2],
    name: [7, 1],
  }
  const [sortBy, sortOrder] = sortMap[sortKey] || sortMap.installs
  if (mode === 'featured') return galleryFeatured(pageSize, pageNumber)
  if (mode === 'recent') return galleryRecent(pageSize, pageNumber)
  return galleryPopular(pageSize, pageNumber, sortBy, sortOrder)
}

module.exports = {
  galleryPopular,
  galleryFeatured,
  galleryRecent,
  gallerySearch,
  galleryExtensionById,
  galleryExtensionRawById,
  fetchExtensionDetailFromGallery,
  browseGallery,
  mapGalleryExtension,
}
