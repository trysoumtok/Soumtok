/**
 * Typo-tolerant intent: misspelled user text still maps to the right tools.
 * Conservative — never rewrite "general" into "generate".
 */

const PHRASE_REPAIRS: [RegExp, string][] = [
  [/\baperance\b/gi, 'appearance'],
  [/\bapperance\b/gi, 'appearance'],
  [/\bappearence\b/gi, 'appearance'],
  [/\btolight\b/gi, 'to light'],
  [/\btodark\b/gi, 'to dark'],
  [/\bcahnegto\b/gi, 'change to'],
  [/\bscetio[n]?\b/gi, 'section'],
  [/\bnatthe\b/gi, 'at the'],
  [/\bthename\b/gi, 'the name'],
  [/\bcalcutor\b/gi, 'calculator'],
  [/\bwebiste\b/gi, 'website'],
  [/\bwebsit\b/gi, 'website'],
  [/\bwebioste\b/gi, 'website'],
  [/\binmy\b/gi, 'in my'],
  [/\brunmy\b/gi, 'run my'],
  [/\btehreal\b/gi, 'the real'],
  [/\bteh\b/gi, 'the'],
  [/\brato\b/gi, 'ratio'],
  [/\baspectrato\b/gi, 'aspect ratio'],
  [/\bmaor\b/gi, 'more'],
  [/\bcan you ad\b/gi, 'can you add'],
  [/\bcould you ad\b/gi, 'could you add'],
  [/\bplease ad\b/gi, 'please add'],
  [/\bad teh\b/gi, 'add the'],
  [/\bad the\b/gi, 'add the'],
  [/\bad any\b/gi, 'add any'],
  [/\bad a\b/gi, 'add a'],
  [/\bad an\b/gi, 'add an'],
  [/\baddtols\b/gi, 'add tools'],
  [/\bchangethis\b/gi, 'change this'],
  [/\bform dark\b/gi, 'from dark'],
  [/\bform light\b/gi, 'from light'],
  [/\ba them change\b/gi, 'a theme change'],
  [/\ba them changer\b/gi, 'a theme changer'],
  [/\bthem changer\b/gi, 'theme changer'],
  [/\bthem change\b/gi, 'theme change'],
  [/\blogoof\b/gi, 'logo of'],
  [/\b(iamge|imge|iamg|imgage|imgae)\b/gi, 'image'],
  [/\b(geneearte|geneeare|geneaerte|genearte|genereate|geneerate|generat|genera|genrate|generae|geneate|gnerate)\b/gi, 'generate'],
  [/\bgen(?!eral\b|eric\b|erous\b|eration\b|erator\b)[a-z]{0,8}r[a-z]{0,6}t[a-z]{0,8}\b/gi, 'generate'],
  [/\b(picutre|pictue|piture)\b/gi, 'picture'],
  [/\b(egale|eagel)\b/gi, 'eagle'],
  [/\b(undetand|undertand|understad)\b/gi, 'understand'],
  [/\b(misplell|mispell|misspel)\b/gi, 'misspell'],
]

const STOP = new Set(
  `a an the for me my of to in on is it or and be do so if at by we you i this that with from still can please they them their then than also just like about into over out up as was are not no yes go on hey hi ok okay sure`.split(
    ' ',
  ),
)

const SKIP_TARGETS = new Set(['general', 'generic', 'generous', 'generation', 'generator', 'real', 'really', 'form', 'from', 'them', 'theme', 'ready', 'readme'])

const INTENT = [
  'generate',
  'create',
  'make',
  'draw',
  'paint',
  'render',
  'imagine',
  'image',
  'images',
  'picture',
  'photo',
  'illustration',
  'artwork',
  'wallpaper',
  'fix',
  'edit',
  'change',
  'update',
  'add',
  'delete',
  'remove',
  'wipe',
  'clear',
  'build',
  'scaffold',
  'run',
  'start',
  'launch',
  'install',
  'deploy',
  'implement',
  'refactor',
  'commit',
  'read',
  'write',
  'grep',
  'explain',
  'describe',
  'understand',
  'misspell',
  'misspelled',
  'tools',
  'tool',
  'file',
  'files',
  'folder',
  'project',
  'website',
  'page',
  'component',
  'footer',
  'header',
  'hero',
  'sidebar',
  'nav',
  'toggle',
  'section',
  'button',
  'eagle',
  'bird',
  'logo',
  'appearance',
  'server',
  'localhost',
  'agent',
]

const INTENT_SET = new Set(INTENT)

const PREFIX_VERBS: { stem: string; word: string; skip: RegExp }[] = [
  { stem: 'gener', word: 'generate', skip: /^(al|ic|ous|ation|ator)/ },
  { stem: 'crea', word: 'create', skip: /^(m|tor|tion|ture)/ },
  { stem: 'imag', word: 'image', skip: /^(ine|inary|ination)/ },
  { stem: 'pict', word: 'picture', skip: /^ure$/ },
  { stem: 'underst', word: 'understand', skip: /^and$/ },
  { stem: 'missp', word: 'misspell', skip: /^ell$/ },
  { stem: 'delet', word: 'delete', skip: /^e$/ },
]

const GLUE_PREFIXES = [
  'understand',
  'generate',
  'misspell',
  'create',
  'delete',
  'please',
  'image',
  'tools',
  'make',
  'read',
  'add',
  'run',
  'the',
  'can',
  'for',
]

const SHORT_MAP: Record<string, string> = {
  rea: 'read',
  teh: 'the',
  adn: 'and',
}

export const TOOL_NAMES = [
  'read',
  'grep',
  'glob',
  'list_dir',
  'write',
  'diff',
  'terminal',
  'read_terminal',
  'read_lints',
  'task',
  'github',
  'fetch',
  'mcp',
  'generate_image',
  'examine_media',
  'delete',
  'wipe_workspace',
  'switch_mode',
  'todo_write',
  'git',
  'codebase_search',
  'browser',
  'read_skill',
  'attempt_completion',
] as const

const TOOL_ALIASES: Record<string, string> = {
  rea: 'read',
  readfile: 'read',
  read_file: 'read',
  listdir: 'list_dir',
  list_directory: 'list_dir',
  search_replace: 'diff',
  str_replace: 'diff',
  strreplace: 'diff',
  apply_patch: 'diff',
  applypatch: 'diff',
  generateimage: 'generate_image',
  geneate_image: 'generate_image',
  genera_image: 'generate_image',
  gen_image: 'generate_image',
  create_image: 'generate_image',
  draw_image: 'generate_image',
  make_image: 'generate_image',
  examime_media: 'examine_media',
  examineimage: 'examine_media',
  codebasesearch: 'codebase_search',
  semantic_search: 'codebase_search',
  semanticsearch: 'codebase_search',
  wipeworkspace: 'wipe_workspace',
  clear_workspace: 'wipe_workspace',
  readlints: 'read_lints',
  readskill: 'read_skill',
  todowrite: 'todo_write',
  readterminal: 'read_terminal',
}

export function levenshtein(a: string, b: string) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  if (Math.abs(a.length - b.length) > 3) return 99
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]
  }
  return prev[b.length]
}

function maxEdit(len: number) {
  if (len <= 3) return 0
  if (len <= 5) return 1
  return 2
}

function closestWord(token: string, words: string[]) {
  if (token.length < 4) return ''
  const max = maxEdit(token.length)
  let best = ''
  let bestD = 99
  let ties = false
  for (const word of words) {
    if (SKIP_TARGETS.has(word)) continue
    const d = levenshtein(token, word)
    if (d <= 0 || d > max) continue
    if (d < bestD) {
      bestD = d
      best = word
      ties = false
    } else if (d === bestD) {
      ties = true
    }
  }
  return ties ? '' : best
}

function prefixExpand(token: string) {
  for (const row of PREFIX_VERBS) {
    if (!token.startsWith(row.stem) || token === row.word) continue
    const rest = token.slice(row.stem.length)
    if (row.skip.test(rest)) continue
    if (rest.length <= 8) return row.word
  }
  return ''
}

function isVerbish(token: string) {
  const t = String(token || '').toLowerCase()
  if (INTENT_SET.has(t)) return true
  return Boolean(prefixExpand(t) || closestWord(t, INTENT))
}

function glueSplit(token: string) {
  for (const prefix of GLUE_PREFIXES) {
    if (token.length <= prefix.length + 2) continue
    if (!token.startsWith(prefix)) continue
    const rest = token.slice(prefix.length)
    if (INTENT_SET.has(rest)) return `${prefix} ${rest}`
    const fuzzy = closestWord(rest, INTENT)
    if (fuzzy) return `${prefix} ${fuzzy}`
  }
  return ''
}

function repairToken(token: string, prev: string, next: string) {
  const lower = token.toLowerCase()
  if (!/^[a-z][a-z'-]*$/i.test(token)) return token
  if (STOP.has(lower) || INTENT_SET.has(lower) || SKIP_TARGETS.has(lower)) return token
  if (lower === 'ad') {
    if (/^(a|an|the|any)$/.test(next) || /^(can|please|could|you)$/.test(prev)) return 'add'
    if (isVerbish(prev) && isVerbish(next)) return 'and'
    return token
  }
  if (SHORT_MAP[lower]) return SHORT_MAP[lower]
  const glued = glueSplit(lower)
  if (glued) return glued
  const prefixed = prefixExpand(lower)
  if (prefixed) return prefixed
  const fuzzy = closestWord(lower, INTENT)
  return fuzzy || token
}

export function repairIntentText(text: string) {
  let out = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  for (const [from, to] of PHRASE_REPAIRS) out = out.replace(from, to)
  const parts = out.split(/(\s+)/)
  const words = parts.filter((_, i) => i % 2 === 0)
  const repairedWords = words.map((word, i) =>
    repairToken(
      word,
      (i > 0 ? repairToken(words[i - 1], '', '') : '').toLowerCase(),
      (words[i + 1] || '').toLowerCase(),
    ),
  )
  let wi = 0
  return parts
    .map((part, i) => (i % 2 === 0 ? repairedWords[wi++] : part))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

function canonTool(raw: string) {
  return String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/__+/g, '_')
}

export function resolveToolName(name: string, allowed?: string[]) {
  const n = canonTool(name)
  if (!n) return String(name || '')
  const pool = (allowed?.length ? allowed : [...TOOL_NAMES]).map((item) => canonTool(item))
  const aliased = TOOL_ALIASES[n] || TOOL_ALIASES[n.replace(/_/g, '')]
  if (aliased && (!allowed?.length || pool.includes(aliased))) return aliased
  if (pool.includes(n)) return n
  const squeezed = n.replace(/_/g, '')
  const bySqueeze = pool.find((item) => item.replace(/_/g, '') === squeezed)
  if (bySqueeze) return bySqueeze
  const hit = closestWord(n, pool) || closestWord(squeezed, pool.map((item) => item.replace(/_/g, '')))
  if (hit) {
    const named = pool.find((item) => item === hit || item.replace(/_/g, '') === hit)
    if (named) return named
  }
  return String(name || n)
}

export function closestName(want: string, names: string[]) {
  const token = String(want || '').toLowerCase()
  if (!token || token.length < 4) return ''
  const rows = names.map((n) => ({ raw: n, lower: String(n || '').toLowerCase() }))
  const hit = closestWord(
    token,
    rows.map((row) => row.lower),
  )
  if (!hit) return ''
  return rows.find((row) => row.lower === hit)?.raw || ''
}
