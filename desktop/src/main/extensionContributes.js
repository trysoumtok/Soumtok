/** Turn extension package.json into VS Code–style Feature Contributions sections. */

function itemsFromContribute(key, value) {
  if (value == null) return []
  switch (key) {
    case 'commands':
      return (value || []).map((x) => x.command || x.title).filter(Boolean)
    case 'languages':
      return (value || []).map((x) => x.id || (x.aliases && x.aliases[0])).filter(Boolean)
    case 'grammars':
      return (value || []).map((x) => x.language || x.scopeName).filter(Boolean)
    case 'themes':
      return (value || []).map((x) => x.label || x.id).filter(Boolean)
    case 'icons':
      return (value || []).map((x) => x.id || x.label).filter(Boolean)
    case 'debuggers':
      return (value || []).map((x) => x.type || x.label).filter(Boolean)
    case 'snippets':
      return (value || []).map((x) => x.language || x.path).filter(Boolean)
    case 'keybindings':
      return (value || []).map((x) => x.command).filter(Boolean)
    case 'jsonValidation':
      return (value || []).map((x) => {
        const match = Array.isArray(x.fileMatch) ? x.fileMatch.join(', ') : x.fileMatch
        return match ? `${match}` : x.url || 'validation'
      })
    case 'languageModelTools':
      return (value || []).map((x) => x.name || x.displayName).filter(Boolean)
    case 'configuration': {
      const props = value.properties || value
      if (props && typeof props === 'object' && !Array.isArray(props)) {
        return Object.keys(props)
      }
      return []
    }
    case 'views':
      return Object.entries(value || {}).flatMap(([container, views]) =>
        (views || []).map((v) => v.id || `${container}.${v.name || 'view'}`),
      )
    case 'viewsContainers':
      return Object.keys(value || {})
    case 'menus':
      return Object.keys(value || {})
    case 'problemMatchers':
      return (value || []).map((x) => x.name).filter(Boolean)
    case 'taskDefinitions':
      return (value || []).map((x) => x.type).filter(Boolean)
    case 'breakpoints':
      return (value || []).map((x) => x.language).filter(Boolean)
    case 'customEditors':
      return (value || []).map((x) => x.viewType || x.displayName).filter(Boolean)
    case 'walkthroughs':
      return (value || []).map((x) => x.id || x.title).filter(Boolean)
    case 'notebooks':
      return (value || []).map((x) => x.type || x.id).filter(Boolean)
    case 'submenus':
      return (value || []).map((x) => x.id || x.label).filter(Boolean)
    case 'semanticTokenTypes':
    case 'semanticTokenModifiers':
      return Array.isArray(value) ? value.map(String) : Object.keys(value || {})
    default:
      if (Array.isArray(value)) {
        return value
          .map((x) => {
            if (typeof x === 'string') return x
            return x.id || x.command || x.title || x.type || x.name || ''
          })
          .filter(Boolean)
      }
      if (typeof value === 'object') return Object.keys(value)
      return []
  }
}

const CONTRIBUTE_ORDER = [
  ['activationEvents', 'Activation Events'],
  ['enabledApiProposals', 'API Proposals'],
  ['commands', 'Commands'],
  ['debuggers', 'Debuggers'],
  ['jsonValidation', 'JSON Validation'],
  ['languageModelTools', 'Language Model Tools'],
  ['languages', 'Programming Languages'],
  ['configuration', 'Settings'],
  ['grammars', 'Grammars'],
  ['themes', 'Themes'],
  ['icons', 'Icon Themes'],
  ['snippets', 'Snippets'],
  ['keybindings', 'Keyboard Shortcuts'],
  ['views', 'Views'],
  ['viewsContainers', 'View Containers'],
  ['menus', 'Menus'],
  ['problemMatchers', 'Problem Matchers'],
  ['taskDefinitions', 'Task Definitions'],
  ['breakpoints', 'Breakpoints'],
  ['customEditors', 'Custom Editors'],
  ['walkthroughs', 'Walkthroughs'],
  ['notebooks', 'Notebooks'],
]

function buildFeatureSections(pkg) {
  if (!pkg || typeof pkg !== 'object') return []
  const sections = []
  const activation = pkg.activationEvents || []
  if (activation.length) {
    sections.push({ id: 'activationEvents', label: 'Activation Events', items: activation.map(String) })
  }
  const proposals = pkg.enabledApiProposals || []
  if (proposals.length) {
    sections.push({ id: 'enabledApiProposals', label: 'API Proposals', items: proposals.map(String) })
  }
  const c = pkg.contributes || {}
  for (const [key, label] of CONTRIBUTE_ORDER) {
    if (key === 'activationEvents' || key === 'enabledApiProposals') continue
    const raw = key === 'configuration' ? c.configuration : c[key]
    const items = itemsFromContribute(key, raw)
    if (items.length) sections.push({ id: key, label, items })
  }
  for (const key of Object.keys(c)) {
    if (CONTRIBUTE_ORDER.some(([k]) => k === key)) continue
    const items = itemsFromContribute(key, c[key])
    if (items.length) {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())
      sections.push({ id: key, label, items })
    }
  }
  return sections
}

function normalizeRepoUrl(url) {
  let u = String(url || '').trim().replace(/^git\+/, '')
  if (u.endsWith('.git')) u = u.slice(0, -4)
  return u
}

function issuesUrlFromRepo(repository) {
  const repo = normalizeRepoUrl(repository)
  if (!repo) return ''
  if (/github\.com/i.test(repo)) {
    return repo.replace(/\/$/, '') + '/issues'
  }
  return ''
}

module.exports = { buildFeatureSections, issuesUrlFromRepo, normalizeRepoUrl }
