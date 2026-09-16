/** VS Code Marketplace protocol against Open VSX (same gallery VSCodium uses). */
const GALLERY_URL = 'https://open-vsx.org/vscode/gallery/extensionquery'
const GALLERY_FLAGS = 914
const VSCODE_TARGET = 'Microsoft.VisualStudio.Code'
const { publisherVerified } = require('../shared/publisherVerified')

async function postGallery(filter) {
  const body = { filters: [filter], flags: GALLERY_FLAGS }
  const res = await fetch(GALLERY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json;api-version=3.0-preview.1',
      'X-Market-Client-Id': 'Soumtok.desktop',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Marketplace gallery ${res.status}`)
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
  return { install, averageRating }
}

function mapGalleryExtension(ext) {
  const publisher = ext.publisher?.publisherName || ''
  const name = ext.extensionName || ''
  const ver = ext.versions?.[0]
  const { install, averageRating } = galleryStats(ext, ver)
  const files = ver?.files || []
  const iconUrl =
    files.find((f) => f.assetType === 'Microsoft.VisualStudio.Services.Icons.Default')?.source || ''
  const vsixUrl =
    files.find((f) => f.assetType === 'Microsoft.VisualStudio.Services.VSIXPackage')?.source || ''
  return {
    id: `${publisher}.${name}`,
    publisher,
    name,
    version: ver?.version || '',
    displayName: ext.displayName || name,
    description: ext.shortDescription || '',
    downloadCount: install,
    averageRating,
    iconUrl,
    vsixUrl,
    publisherDisplayName: ext.publisher?.displayName || publisher,
    verified: publisherVerified(ext.publisher),
  }
}

async function galleryPopular(pageSize = 50, pageNumber = 1) {
  const { extensions, total } = await postGallery({
    criteria: [{ filterType: 8, value: VSCODE_TARGET }],
    pageNumber: Math.max(1, pageNumber),
    pageSize: Math.min(Math.max(pageSize, 1), 100),
    sortBy: 4,
    sortOrder: 2,
  })
  return { extensions, total }
}

async function gallerySearch(query, pageSize = 48, pageNumber = 1) {
  const q = String(query || '').trim()
  if (!q) return { extensions: [], total: 0 }
  const { extensions, total } = await postGallery({
    criteria: [
      { filterType: 10, value: q.slice(0, 200) },
      { filterType: 8, value: VSCODE_TARGET },
    ],
    pageNumber: Math.max(1, pageNumber),
    pageSize: Math.min(Math.max(pageSize, 1), 100),
    sortBy: 0,
    sortOrder: 0,
  })
  return { extensions, total }
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

module.exports = {
  galleryPopular,
  gallerySearch,
  galleryExtensionById,
  mapGalleryExtension,
  GALLERY_URL,
  GALLERY_FLAGS,
  VSCODE_TARGET,
}
