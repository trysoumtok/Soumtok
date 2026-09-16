const fs = require('fs')
const path = require('path')

function readExtensionPackage(installDir) {
  const rootPkg = path.join(installDir, 'package.json')
  const nestedPkg = path.join(installDir, 'extension', 'package.json')
  const pkgPath = fs.existsSync(nestedPkg) ? nestedPkg : rootPkg
  try {
    return { pkg: JSON.parse(fs.readFileSync(pkgPath, 'utf8')), pkgRoot: path.dirname(pkgPath) }
  } catch {
    return null
  }
}

function resolveIconPath(pkgRoot, iconRef) {
  if (!iconRef) return ''
  let rel = iconRef
  if (typeof rel === 'object') {
    rel = rel.dark || rel.light || rel.default || ''
  }
  rel = String(rel || '').trim()
  if (!rel) return ''
  const candidate = path.join(pkgRoot, rel)
  if (fs.existsSync(candidate)) return candidate
  return ''
}

function pickOpenCommand(pkg) {
  const cmds = pkg.contributes?.commands || []
  const ranked = cmds
    .map((c) => ({
      command: c.command,
      title: String(c.title || ''),
      score: 0,
    }))
    .filter((c) => c.command)
  for (const row of ranked) {
    const t = row.title.toLowerCase()
    const cmd = row.command.toLowerCase()
    if (/claude-vscode\.editor\.open$/i.test(row.command)) row.score += 200
    if (/editor\.openlast|editor\.open$/i.test(cmd)) row.score += 160
    if (/primaryeditor|primary.editor|openinprimary/.test(cmd)) row.score += 40
    if (/claude/.test(cmd) && /open|show|focus/.test(cmd)) row.score += 60
    if (/primary editor|open in new tab/.test(t)) row.score += 50
    if (/sidebar|side bar/.test(t)) row.score += 35
    if (/open/.test(t) && !/settings|config|walkthrough|help|doc|terminal|window|worktree/.test(t)) row.score += 30
    if (/new window|worktree|logout|sign out|focus|toggle|terminal/.test(t)) row.score -= 20
  }
  ranked.sort((a, b) => b.score - a.score)
  return ranked[0]?.command || ''
}

function activityContainersFromPkg(pkg, pkgRoot, row) {
  const extensionId = `${pkg.publisher}.${pkg.name}`.toLowerCase()
  const activity = pkg.contributes?.viewsContainers?.activitybar || []
  const secondary = pkg.contributes?.viewsContainers?.secondarySidebar || []
  const containers = [...activity, ...secondary]
  const seen = new Set()
  const out = []

  for (const c of containers) {
    const containerId = c.id || extensionId
    if (seen.has(containerId)) continue
    seen.add(containerId)
    const iconPath =
      resolveIconPath(pkgRoot, c.icon) || resolveIconPath(pkgRoot, pkg.icon) || ''
    out.push({
      extensionId,
      containerId,
      title: c.title || pkg.displayName || pkg.name,
      iconPath,
      installPath: row.path,
      openCommand: pickOpenCommand(pkg),
      publisher: pkg.publisher,
      name: pkg.name,
      displayName: pkg.displayName || pkg.name,
    })
  }

  if (out.length) return out.slice(0, 2)

  const hasViews = pkg.contributes?.views && Object.keys(pkg.contributes.views).length
  const openCommand = pickOpenCommand(pkg)
  if (!hasViews && !openCommand) return []

  const iconPath = resolveIconPath(pkgRoot, pkg.icon) || ''
  return [
    {
      extensionId,
      containerId: extensionId,
      title: pkg.displayName || pkg.name,
      iconPath,
      installPath: row.path,
      openCommand,
      publisher: pkg.publisher,
      name: pkg.name,
      displayName: pkg.displayName || pkg.name,
    },
  ]
}

function listExtensionActivityContributions(installedRows) {
  const byExtension = new Map()
  for (const row of installedRows || []) {
    if (!row?.path) continue
    const parsed = readExtensionPackage(row.path)
    if (!parsed?.pkg) continue
    const items = activityContainersFromPkg(parsed.pkg, parsed.pkgRoot, row)
    if (!items.length) continue
    const primary = items[0]
    if (!byExtension.has(primary.extensionId)) {
      byExtension.set(primary.extensionId, primary)
    }
  }
  return [...byExtension.values()].sort((a, b) =>
    String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' }),
  )
}

module.exports = {
  listExtensionActivityContributions,
  readExtensionPackage,
  resolveIconPath,
}
