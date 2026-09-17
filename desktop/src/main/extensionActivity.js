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



function resolveNlsString(pkgRoot, value, fallback = '') {
  const raw = String(value || '').trim()
  const m = raw.match(/^%([\w.-]+)%$/)
  if (!m) return raw || fallback
  for (const file of ['package.nls.json', 'package.nls.en.json']) {
    try {
      const nls = JSON.parse(fs.readFileSync(path.join(pkgRoot, file), 'utf8'))
      const hit = nls[m[1]] || nls[m[1].replace(/-/g, '.')]
      if (hit) return String(hit)
    } catch {
      /* try next */
    }
  }
  return fallback || m[1]
}

function hasEditorOpenCommand(pkg) {
  const cmds = pkg.contributes?.commands || []
  return cmds.some((c) => /claude-vscode\.editor\.open$|editor\.openlast|editor\.open$|openinprimary|primaryeditor/i.test(String(c.command || '')))
}



/**
 * Sidebar extensions (Cline, etc.) register their view only after activation — the
 * workbench.view.extension.* command is not available on first load and throws in the UI.
 * Those open by clicking the activity bar icon once the extension has activated.
 */

function pickOpenCommand(pkg, containerId = '') {

  const cid =

    String(containerId || '').trim() ||

    pkg.contributes?.viewsContainers?.activitybar?.[0]?.id ||

    pkg.contributes?.viewsContainers?.secondarySidebar?.[0]?.id ||

    ''

  if (cid) {
    const extName = String(pkg.name || '').toLowerCase()
    if (extName === 'claude-dev' || extName.includes('cline')) return 'cline.focusChatInput'
    return `workbench.view.extension.${cid}`
  }



  const cmds = pkg.contributes?.commands || []

  const ranked = cmds

    .map((c) => ({

      command: c.command,

      title: String(c.title || ''),

      score: 0,

    }))

    .filter((c) => c.command)

  const extName = String(pkg.name || '').toLowerCase()

  const isCline = extName === 'claude-dev' || extName.includes('cline')

  for (const row of ranked) {

    const t = row.title.toLowerCase()

    const cmd = row.command.toLowerCase()

    if (/claude-vscode\.editor\.open$/i.test(row.command)) row.score += 200

    if (/editor\.openlast|editor\.open$/i.test(cmd)) row.score += 160

    if (isCline) {

      if (/plusbutton|historybutton|mcpbutton|marketplacebutton|accountbutton|settingsbutton/.test(cmd)) {

        row.score -= 200

      }

      if (/claude-dev\.|cline\./.test(cmd) && /open|show|sidebar|activate|popout/.test(cmd)) row.score += 120

      if (/focuschatinput|focus/.test(cmd)) row.score += 40

      if (/claude-vscode|anthropic\.|claude-code/.test(cmd)) row.score -= 200

    } else if (/claude-dev\.|cline\./.test(cmd) && /open|show|focus|sidebar|activate|plus/.test(cmd)) {

      row.score += 90

    }

    if (/primaryeditor|primary.editor|openinprimary/.test(cmd)) row.score += 40

    if (!isCline && /claude/.test(cmd) && /open|show|focus/.test(cmd)) row.score += 60

    if (/primary editor|open in new tab/.test(t)) row.score += 50

    if (/sidebar|side bar/.test(t)) row.score += 35

    if (/open/.test(t) && !/settings|config|walkthrough|help|doc|terminal|window|worktree/.test(t)) row.score += 30

    if (/new window|worktree|logout|sign out|toggle|terminal/.test(t)) row.score -= 20

  }

  ranked.sort((a, b) => b.score - a.score)

  return ranked[0]?.command || ''

}



function classifyExtension(pkg) {
  const c = pkg?.contributes || {}
  const languages = (c.languages || [])
    .map((x) => x?.id || (Array.isArray(x?.aliases) ? x.aliases[0] : ''))
    .filter(Boolean)
  const hasAppUi = Boolean(
    (c.viewsContainers?.activitybar || []).length || (c.viewsContainers?.secondarySidebar || []).length,
  )
  const hasLang =
    languages.length > 0 || (c.grammars || []).length > 0 || (c.debuggers || []).length > 0
  let kind = 'tool'
  if (hasAppUi) kind = 'app'
  else if (hasLang) kind = 'language'
  else if ((c.themes || []).length) kind = 'theme'
  return { kind, languages, hasAppUi }
}

function inferEmbedSurface(pkg, containerId = '', openCommand = '') {

  if (hasEditorOpenCommand(pkg)) return 'editor'

  const cid =

    String(containerId || '').trim() ||

    pkg.contributes?.viewsContainers?.activitybar?.[0]?.id ||

    pkg.contributes?.viewsContainers?.secondarySidebar?.[0]?.id ||

    ''

  if (cid || /^workbench\.view\.extension\./i.test(openCommand)) return 'sidebar'

  const extName = String(pkg.name || '').toLowerCase()

  if (extName === 'claude-dev' || extName.includes('cline')) return 'sidebar'

  return 'editor'

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

    const openCommand = pickOpenCommand(pkg, containerId)

    const iconPath =

      resolveIconPath(pkgRoot, c.icon) || resolveIconPath(pkgRoot, pkg.icon) || ''

    out.push({

      extensionId,

      containerId,

      title: resolveNlsString(pkgRoot, c.title, pkg.displayName || pkg.name),

      iconPath,

      installPath: row.path,

      openCommand,

      embedSurface: inferEmbedSurface(pkg, containerId, openCommand),

      publisher: pkg.publisher,

      name: pkg.name,

      displayName: resolveNlsString(pkgRoot, pkg.displayName, pkg.name),

    })

  }



  if (out.length) return out.slice(0, 2)

  const classified = classifyExtension(pkg)
  if (classified.kind === 'language' || classified.kind === 'theme') return []

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

      embedSurface: inferEmbedSurface(pkg, '', openCommand),

      publisher: pkg.publisher,

      name: pkg.name,

      displayName: resolveNlsString(pkgRoot, pkg.displayName, pkg.name),

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

  pickOpenCommand,

  inferEmbedSurface,

  classifyExtension,

}

