/** DeepSeek sometimes emits tool calls as DSML / fake XML in chat instead of JSON tools. */

let parseFileReadViaShell
try {
  parseFileReadViaShell = require('./desktopTools').parseFileReadViaShell
} catch {
  parseFileReadViaShell = () => null
}

function normalizeDsmlSource(text) {
  let s = String(text || '').replace(/\uFF5C/g, '|')
  // Squeeze "< | | DSML | |" tag noise only — never collapse || in source/diffs.
  s = s.replace(/<([^>\n]*)>/g, (full) => {
    if (!/DSML/i.test(full)) return full.replace(/<\s+/g, '<').replace(/\s+>/g, '>')
    let t = full
    for (let i = 0; i < 16; i++) {
      const next = t.replace(/\s*\|\s*\|\s*/g, '|')
      if (next === t) break
      t = next
    }
    return t.replace(/<\s+/g, '<').replace(/\s+>/g, '>')
  })
  return s
}

function stripFakeXmlTools(s) {
  let out = String(s || '')
  out = out.replace(/<write\s+path=["'][^"']+["'][^>]*>[\s\S]*?<\/write>/gi, '')
  out = out.replace(/<read(?:\s[^>]*)?>[\s\S]*?<\/read>/gi, '')
  out = out.replace(/<(?:read|write|diff|terminal|read_terminal)\b[^>]*\/\s*>/gi, '')
  out = out.replace(/<terminal\b[\s\S]*?(?:\/>|><\/terminal>)/gi, '')
  out = out.replace(/<read_terminal\b[\s\S]*?(?:\/>|><\/read_terminal>)/gi, '')
  out = out.replace(/<diff\b[^>]*>[\s\S]*?(?:<\/diff>|\*\*\*\s*End Patch)/gi, '')
  out = out.replace(/<diff\b[^>]*>[\s\S]*$/gi, '')
  out = out.replace(/^\s*@@.*$/gm, '')
  out = out.replace(/^\s*\*\*\*.*$/gm, '')
  return out
}

function stripDsmlFromText(text) {
  let s = normalizeDsmlSource(text)
  let prev = ''
  let passes = 0
  while (prev !== s && passes < 12) {
    prev = s
    passes += 1
    s = s.replace(/<\|DSML\|[^>]*>[\s\S]*?<\/\|DSML\|[^>]*>/gi, '')
  }
  s = stripFakeXmlTools(s)
  s = s.replace(/<\|DSML\|[\s\S]*$/gi, '')
  s = s.replace(/<\|DSML\|[^>\n]*/gi, '')
  s = s.replace(/<\/\|DSML\|[^>\n]*/gi, '')
  s = s.replace(/^\s*>\s*$/gm, '')
  s = s.trim()
  if (/^[>\s]+$/.test(s)) return ''
  return s
}

function parseDsmlParameters(block) {
  const args = {}
  const re = /<\|DSML\|parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/\|DSML\|parameter>/gi
  let m
  while ((m = re.exec(block))) {
    args[m[1]] = m[2].trim()
  }
  return args
}

function mapDsmlToolName(name) {
  const n = String(name || '').toLowerCase()
  if (n === 'shell' || n === 'bash') return 'terminal'
  if (n === 'read_file') return 'read'
  if (n === 'str_replace' || n === 'apply_patch' || n === 'edit') return 'diff'
  return n
}

function shellCommandToListDir(command) {
  const cmd = String(command || '').trim()
  if (!cmd) return null
  if (!/dir\s+\/b/i.test(cmd)) return null
  if (/[;&|`$]/.test(cmd.replace(/cd\s+\/d\s+"[^"]+"\s*&&\s*dir\s+\/b\s*\/a?/i, ''))) return null
  return '.'
}

function terminalArgsFromCommand(cmd) {
  const asRead = typeof parseFileReadViaShell === 'function' ? parseFileReadViaShell(cmd) : null
  if (asRead?.path) {
    const args = { path: asRead.path }
    if (asRead.startLine) args.start_line = String(asRead.startLine)
    if (asRead.endLine) args.end_line = String(asRead.endLine)
    return { name: 'read', args }
  }
  const asList = shellCommandToListDir(cmd)
  if (asList != null) return { name: 'list_dir', args: { path: asList } }
  return { name: 'terminal', args: { command: cmd } }
}

function dsmlInvokeToCall(rawName, params) {
  let name = mapDsmlToolName(rawName)
  let args = {}
  if (name === 'terminal') {
    const mapped = terminalArgsFromCommand(params.command || params.cmd || '')
    name = mapped.name
    args = mapped.args
  } else if (name === 'read') {
    args = { path: params.path || params.file || '' }
    if (params.start_line || params.startLine) args.start_line = params.start_line || params.startLine
    if (params.end_line || params.endLine) args.end_line = params.end_line || params.endLine
  } else if (name === 'list_dir') {
    args = { path: params.path || params.dir || '.' }
  } else if (name === 'grep') {
    args = { pattern: params.pattern || params.query || '', glob: params.glob || params.path || '' }
  } else if (name === 'write') {
    args = { path: params.path || params.file || '', content: params.content || params.body || '' }
  } else if (name === 'diff') {
    args = {
      path: params.path || params.file || '',
      old_string: params.old_string || params.search || '',
      new_string: params.new_string || params.replace || '',
      content: params.content || params.body || '',
    }
  } else {
    args = params
  }
  return {
    name,
    arguments: JSON.stringify(args),
  }
}

function nextCallId(prefix, i) {
  return `${prefix}_${Date.now()}_${i}`
}

function attr(block, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')
  const m = String(block || '').match(re)
  return m ? m[2] ?? m[3] ?? '' : ''
}

function sliceQuotedAttr(block, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*"`, 'i')
  const m = String(block || '').match(re)
  if (!m) return attr(block, name)
  const start = m.index + m[0].length
  const tail = block.slice(start)
  const end = tail.search(/"\s*(?:\/\s*>|>|\s+\w+\s*=)/)
  return (end >= 0 ? tail.slice(0, end) : tail).replace(/"+$/, '')
}

function unifiedDiffToEdits(filePath, body) {
  const lines = String(body || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
  const edits = []
  let oldLines = []
  let newLines = []
  const flush = () => {
    const old_string = oldLines.join('\n')
    const new_string = newLines.join('\n')
    if (old_string !== new_string && (old_string || new_string)) {
      edits.push({ path: filePath, old_string, new_string })
    }
    oldLines = []
    newLines = []
  }
  for (const line of lines) {
    if (/^@@/.test(line) || /^\*\*\*/.test(line) || /^diff --git/.test(line) || /^---\s/.test(line) || /^\+\+\+\s/.test(line)) {
      flush()
      continue
    }
    if (line.startsWith('+')) newLines.push(line.slice(1))
    else if (line.startsWith('-')) oldLines.push(line.slice(1))
    else if (line.startsWith(' ')) {
      oldLines.push(line.slice(1))
      newLines.push(line.slice(1))
    }
  }
  flush()
  return edits
}

function parseXmlChatTools(text) {
  const src = normalizeDsmlSource(text)
  const calls = []
  let i = 0
  const push = (name, args) => {
    calls.push({
      id: nextCallId(`xml_${name}`, i++),
      name,
      arguments: JSON.stringify(args),
    })
  }

  let m
  const writeRe = /<write\s+path=["']([^"']+)["'][^>]*>([\s\S]*?)<\/write>/gi
  while ((m = writeRe.exec(src))) {
    const filePath = String(m[1] || '').trim()
    if (!filePath) continue
    push('write', { path: filePath, content: String(m[2] || '').replace(/^\n/, '') })
  }

  const readBlock = /<read(?:\s+path=["']([^"']+)["'][^>]*)?>([\s\S]*?)<\/read>/gi
  while ((m = readBlock.exec(src))) {
    const filePath = String(m[1] || m[2] || '').trim()
    if (!filePath || /[<>]/.test(filePath)) continue
    push('read', { path: filePath })
  }

  const readSelf = /<read\s+path=["']([^"']+)["'][^>]*\/\s*>/gi
  while ((m = readSelf.exec(src))) {
    const filePath = String(m[1] || '').trim()
    if (filePath) push('read', { path: filePath })
  }

  const termRe = /<terminal\b([\s\S]*?)(?:\/>|><\/terminal>)/gi
  while ((m = termRe.exec(src))) {
    const cmd = sliceQuotedAttr(m[0], 'command') || attr(m[1], 'command') || attr(m[1], 'cmd')
    if (!cmd.trim()) continue
    const mapped = terminalArgsFromCommand(cmd.trim())
    push(mapped.name, mapped.args)
  }

  const rtRe = /<read_terminal\b([^>]*)\/?\s*>/gi
  while ((m = rtRe.exec(src))) {
    const wait = attr(m[1], 'wait_ms') || attr(m[1], 'waitMs')
    push('read_terminal', wait ? { wait_ms: wait } : {})
  }

  const diffRe = /<diff\s+path=["']([^"']+)["'][^>]*>([\s\S]*?)(?:<\/diff>|\*\*\*\s*End Patch)/gi
  let foundClosedDiff = false
  while ((m = diffRe.exec(src))) {
    foundClosedDiff = true
    const filePath = String(m[1] || '').trim()
    const body = String(m[2] || '')
    if (!filePath) continue
    const edits = unifiedDiffToEdits(filePath, body)
    if (edits.length) {
      for (const edit of edits) push('diff', edit)
    } else if (body.trim()) {
      push('diff', { path: filePath, content: body.replace(/^\n/, '') })
    }
  }

  if (!foundClosedDiff && /<diff\s+path=/i.test(src)) {
    const open = src.match(/<diff\s+path=["']([^"']+)["'][^>]*>([\s\S]*)$/i)
    if (open) {
      const edits = unifiedDiffToEdits(open[1].trim(), open[2])
      for (const edit of edits) push('diff', edit)
    }
  }

  return calls
}

function parseDsmlInvokes(text) {
  const src = normalizeDsmlSource(text)
  const calls = []
  let i = 0
  if (/DSML/i.test(src)) {
    const re = /<\|DSML\|invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/\|DSML\|invoke>/gi
    let m
    while ((m = re.exec(src))) {
      const call = dsmlInvokeToCall(m[1], parseDsmlParameters(m[2]))
      calls.push({
        id: nextCallId('dsml', i++),
        name: call.name,
        arguments: call.arguments,
      })
    }
  }
  for (const extra of parseXmlChatTools(src)) {
    extra.id = extra.id || nextCallId('xml', i++)
    calls.push(extra)
  }
  return calls
}

function textLooksLikeDsml(text) {
  const s = normalizeDsmlSource(text)
  if (/<\|DSML\|/i.test(s)) return true
  if (/DSML\s*\|\s*invoke/i.test(s)) return true
  if (/<\s*(\|\s*)+DSML/i.test(String(text || ''))) return true
  if (/<(write|read|diff|terminal|read_terminal)\b/i.test(s)) return true
  if (/\*\*\*\s*End Patch/i.test(s)) return true
  return false
}

function sanitizeAssistantText(rawText) {
  const calls = parseDsmlInvokes(rawText)
  let cleaned = stripDsmlFromText(rawText)
  if (textLooksLikeDsml(cleaned)) cleaned = stripDsmlFromText(cleaned)
  if (textLooksLikeDsml(cleaned)) cleaned = ''
  return { cleaned, calls: calls.length ? calls : parseDsmlInvokes(rawText) }
}

module.exports = {
  stripDsmlFromText,
  parseDsmlInvokes,
  textLooksLikeDsml,
  sanitizeAssistantText,
  mapDsmlToolName,
  normalizeDsmlSource,
  parseXmlChatTools,
  unifiedDiffToEdits,
}
