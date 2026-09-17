/** Parse + normalize model tool-call arguments (handles partial JSON, aliases, nested shapes). */

function unescapeToolJson(value) {
  return String(value || '')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

function peekToolArgs(raw) {
  const s = typeof raw === 'string' ? raw : ''
  const args = {}
  const path =
    /"(?:path|file|filepath|file_path|filename|target_path|target|filePath)"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(s)?.[1]
  if (path) args.path = unescapeToolJson(path)
  const content = /"(?:content|body|source)"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(s)?.[1]
  if (content) args.content = unescapeToolJson(content)
  const oldS = /"(?:old_string|search|find|old)"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(s)?.[1]
  if (oldS) args.old_string = unescapeToolJson(oldS)
  const newS = /"(?:new_string|replace|new|to)"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(s)?.[1]
  if (newS) args.new_string = unescapeToolJson(newS)
  const command = /"(?:command|cmd)"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(s)?.[1]
  if (command) args.command = unescapeToolJson(command)
  return args
}

function normalizeWorkspaceEditArgs(args) {
  const out = { ...(args && typeof args === 'object' ? args : {}) }
  const nested =
    out.parameters && typeof out.parameters === 'object'
      ? out.parameters
      : out.input && typeof out.input === 'object'
        ? out.input
        : null
  if (nested) Object.assign(out, nested)

  const path =
    out.path ||
    out.file ||
    out.filepath ||
    out.file_path ||
    out.filename ||
    out.target_path ||
    out.target ||
    out.filePath ||
    ''
  if (path) {
    out.path = String(path).replace(/^\/+/, '').replace(/\\/g, '/')
  }

  if (out.body != null && out.content == null) out.content = out.body
  if (out.source != null && out.content == null) out.content = out.source
  if (out.search != null && out.old_string == null) out.old_string = out.search
  if (out.find != null && out.old_string == null) out.old_string = out.find
  if (out.old != null && out.old_string == null) out.old_string = out.old
  if (out.from != null && out.old_string == null) out.old_string = out.from
  if (out.replace != null && out.new_string == null) out.new_string = out.replace
  if (out.new != null && out.new_string == null) out.new_string = out.new
  if (out.to != null && out.new_string == null) out.new_string = out.to

  return out
}

function parseToolArgs(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return normalizeWorkspaceEditArgs(raw)
  }
  const s = String(raw || '').trim()
  if (!s) return {}
  try {
    const parsed = JSON.parse(s)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return normalizeWorkspaceEditArgs(parsed)
    }
  } catch {
    /* partial / truncated JSON from streaming */
  }
  const peek = peekToolArgs(s)
  return Object.keys(peek).length ? normalizeWorkspaceEditArgs(peek) : {}
}

function toolCallArgs(call) {
  const raw = call?.arguments ?? call?.input ?? call?.function?.arguments ?? '{}'
  return parseToolArgs(raw)
}

function editPathFromArgs(args) {
  return String(args?.path || args?.file || '')
    .replace(/^\/+/, '')
    .replace(/\\/g, '/')
}

function editPathFromCall(call) {
  return editPathFromArgs(toolCallArgs(call))
}

function isEditToolName(name) {
  return /^(write|diff|edit|str_replace|apply_patch)$/i.test(String(name || ''))
}

function normalizeToolCallShape(call) {
  if (!call) return call
  const name = call.name || call.function?.name || ''
  const raw = call.arguments ?? call.input ?? call.function?.arguments ?? '{}'
  const args =
    typeof raw === 'object' && raw != null && !Array.isArray(raw)
      ? normalizeWorkspaceEditArgs(raw)
      : parseToolArgs(raw)
  return {
    ...call,
    id: call.id || call.function?.id,
    name,
    arguments: JSON.stringify(args),
  }
}

/** When the model emits broken native write/diff calls, recover paths from XML/DSML in assistant text. */
function mergeToolCalls(nativeCalls, assistantText, sanitizeAssistantText) {
  const native = (nativeCalls || []).map(normalizeToolCallShape)
  const fromText = (sanitizeAssistantText(assistantText || '').calls || []).map(normalizeToolCallShape)
  if (!native.length) return fromText
  if (!fromText.length) return native

  const nativeBrokenEdits = native.filter((c) => isEditToolName(c.name) && !editPathFromCall(c))
  if (nativeBrokenEdits.length === native.length && fromText.length) return fromText

  const out = []
  let textEditIdx = 0
  const textEdits = fromText.filter((c) => isEditToolName(c.name) && editPathFromCall(c))

  for (const call of native) {
    if (isEditToolName(call.name) && !editPathFromCall(call)) {
      const repair = textEdits[textEditIdx] || textEdits.find((c) => c.name === call.name)
      if (repair) {
        textEditIdx += 1
        out.push({ ...call, arguments: repair.arguments })
        continue
      }
    }
    out.push(call)
  }

  for (const fc of fromText) {
    if (!isEditToolName(fc.name) || !editPathFromCall(fc)) continue
    const p = editPathFromCall(fc)
    const already = out.some((c) => isEditToolName(c.name) && editPathFromCall(c) === p && c.name === fc.name)
    if (!already) out.push(fc)
  }

  return out.length ? out : native
}

module.exports = {
  parseToolArgs,
  peekToolArgs,
  normalizeWorkspaceEditArgs,
  toolCallArgs,
  editPathFromArgs,
  editPathFromCall,
  isEditToolName,
  normalizeToolCallShape,
  mergeToolCalls,
}
