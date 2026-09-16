/** Mirror shared/chatMedia.ts normalizeChatMessagesForAgent + messageHasBody for Electron main. */

function messageHasBody(item) {
  if (item.role === 'tool') return Boolean(item.tool_call_id)
  if (item.role === 'assistant' && item.tool_calls?.length) return true
  return Boolean(item.content?.trim() || item.files?.length)
}

function normalizeChatMessagesForAgent(messages) {
  const kept = []
  for (const item of messages || []) {
    if (item.role === 'tool') {
      const id = item.tool_call_id
      if (!id) continue
      const parent = [...kept]
        .reverse()
        .find((m) => m.role === 'assistant' && m.tool_calls?.some((tc) => tc.id === id))
      if (parent) kept.push(item)
      continue
    }
    if (!messageHasBody(item)) continue
    if (item.role === 'assistant' && item.tool_calls?.length) {
      kept.push({
        ...item,
        content: item.content?.trim() ? item.content : '',
        tool_calls: item.tool_calls.map((tc, index) => ({
          ...tc,
          id: tc.id || `call_${index}_${kept.length}`,
        })),
      })
      continue
    }
    kept.push(item)
  }
  return kept
}

/** OpenAI/DeepSeek require every tool message immediately after its assistant tool_calls turn. */
function repairToolConversation(messages) {
  const normalized = normalizeChatMessagesForAgent(messages)
  const out = []
  let pendingIds = null

  const dropIncompleteToolTurn = () => {
    while (out.length && out[out.length - 1].role === 'tool') out.pop()
    if (out.length && out[out.length - 1].role === 'assistant' && out[out.length - 1].tool_calls?.length) {
      out.pop()
    }
    pendingIds = null
  }

  for (const item of normalized) {
    if (pendingIds?.size) {
      if (item.role === 'tool' && item.tool_call_id && pendingIds.has(item.tool_call_id)) {
        out.push(item)
        pendingIds.delete(item.tool_call_id)
        if (!pendingIds.size) pendingIds = null
        continue
      }
      dropIncompleteToolTurn()
    }
    if (item.role === 'tool') continue
    if (item.role === 'assistant' && item.tool_calls?.length) {
      out.push(item)
      pendingIds = new Set(item.tool_calls.map((tc) => tc.id).filter(Boolean))
      continue
    }
    out.push(item)
  }
  if (pendingIds?.size) dropIncompleteToolTurn()
  return out
}

function toolContentPassthrough(text) {
  return String(text ?? '')
}

function providerToolCalls(item) {
  return (item.tool_calls || []).map((tc, index) => ({
    ...tc,
    id: tc.id || `call_${index}`,
    type: 'function',
    function: {
      name: tc.function?.name || 'tool',
      arguments: tc.function?.arguments || '{}',
    },
  }))
}

function providerToolRow(callId, name, content) {
  return {
    role: 'tool',
    tool_call_id: callId,
    name: name || 'tool',
    content: toolContentPassthrough(content) || '(no output)',
  }
}

/** Provider-safe history: valid assistant→tool chains, tool rows in tool_calls order. */
function flattenToolTurnsForProvider(messages) {
  const raw = Array.isArray(messages) ? messages.filter(Boolean) : []
  const toolIndex = new Map()
  for (const item of raw) {
    if (item.role === 'tool' && item.tool_call_id && !toolIndex.has(item.tool_call_id)) {
      toolIndex.set(item.tool_call_id, item)
    }
  }
  const claimed = new Set()
  const out = []
  for (const item of raw) {
    if (item.role === 'assistant' && item.tool_calls?.length) {
      const calls = providerToolCalls(item)
      out.push({
        role: 'assistant',
        content: item.content?.trim() ? item.content : '',
        tool_calls: calls,
      })
      for (const tc of calls) {
        const hit = toolIndex.get(tc.id)
        claimed.add(tc.id)
        out.push(
          providerToolRow(
            tc.id,
            hit?.name || tc.function.name,
            hit?.content || '(tool produced no result — continue with what you have.)',
          ),
        )
      }
      continue
    }
    if (item.role === 'tool') {
      if (item.tool_call_id && claimed.has(item.tool_call_id)) continue
      out.push({
        role: 'user',
        content: `[${item.name || 'tool'}]\n${toolContentPassthrough(item.content)}`,
      })
      if (item.tool_call_id) claimed.add(item.tool_call_id)
      continue
    }
    out.push(item)
  }
  return out.filter(
    (m) => messageHasBody(m) || (m.role === 'assistant' && m.tool_calls?.length),
  )
}

function isProviderToolChainValid(messages) {
  let pending = null
  for (const item of messages || []) {
    if (pending?.length) {
      if (item.role !== 'tool' || item.tool_call_id !== pending[0]) return false
      pending.shift()
      if (!pending.length) pending = null
      continue
    }
    if (item.role === 'tool') return false
    if (item.role === 'assistant' && item.tool_calls?.length) {
      pending = item.tool_calls.map((tc) => tc.id).filter(Boolean)
      if (!pending.length) return false
    }
  }
  return !pending?.length
}

function messagesForProvider(messages) {
  const flat = flattenToolTurnsForProvider(messages)
  if (isProviderToolChainValid(flat)) return flat
  return flattenToolTurnsForProvider(repairToolConversation(messages))
}

function toolTurnDigest(assistant, tools) {
  const header = assistant.content?.trim() ? `${assistant.content.trim()}\n\n` : ''
  const body = tools
    .map((t) => `[${t.name || 'tool'}]\n${toolContentPassthrough(t.content)}`)
    .join('\n\n---\n\n')
  return `${header}Tool results on the user's machine:\n${body}`
}

/** Persisted / follow-up history: no tool or tool_calls roles (avoids provider chain errors). */
function storageSafeModelMessages(messages) {
  const flat = flattenToolTurnsForProvider(repairToolConversation(messages))
  const out = []
  for (let i = 0; i < flat.length; i++) {
    const item = flat[i]
    if (item.role === 'assistant' && item.tool_calls?.length) {
      const tools = []
      let j = i + 1
      while (j < flat.length && flat[j].role === 'tool') {
        tools.push(flat[j])
        j++
      }
      out.push({ role: 'user', content: toolTurnDigest(item, tools) })
      i = j - 1
      continue
    }
    if (item.role === 'tool') {
      out.push({
        role: 'user',
        content: `[${item.name || 'tool'}]\n${toolContentPassthrough(item.content)}`,
      })
      continue
    }
    if (item.role === 'assistant') {
      const text = typeof item.content === 'string' ? item.content.trim() : ''
      if (text) out.push({ role: 'assistant', content: text })
      continue
    }
    out.push(item)
  }
  return out.filter((m) => messageHasBody(m))
}

module.exports = {
  messageHasBody,
  normalizeChatMessagesForAgent,
  repairToolConversation,
  flattenToolTurnsForProvider,
  isProviderToolChainValid,
  messagesForProvider,
  storageSafeModelMessages,
}
