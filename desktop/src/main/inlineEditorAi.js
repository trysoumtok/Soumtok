const { postDesktopAgentRound, shouldUseStudioCompleteFallback } = require('./agentHarness')

function stripFences(text) {
  let t = String(text || '').trim()
  const m = t.match(/^```[\w]*\n([\s\S]*?)```\s*$/m)
  if (m) t = m[1].trim()
  return t
}

function tabCompletionModel(payload) {
  const m = String(payload?.model || '').trim()
  if (!m || m === 'auto') return 'deepseek-v4-flash'
  return m
}

async function runEditorAiAssist(api, payload) {
  const kind = payload?.kind === 'inline-edit' ? 'inline-edit' : 'tab'
  const model = String(payload?.model || 'auto').trim() || 'auto'
  const tabModel = kind === 'tab' ? tabCompletionModel(payload) : model
  const language = String(payload?.language || 'plaintext')
  const filePath = String(payload?.filePath || '')
  const folder = payload?.folder || null
  const prefix = String(payload?.prefix || '')
  const suffix = String(payload?.suffix || '')
  const selection = String(payload?.selection || '')
  const instruction = String(payload?.instruction || '').trim()
  const relatedSnippets = Array.isArray(payload?.relatedSnippets) ? payload.relatedSnippets : []
  const openFiles = Array.isArray(payload?.openFiles)
    ? payload.openFiles
    : filePath
      ? [filePath]
      : []

  let userContent
  if (kind === 'inline-edit') {
    if (!selection && !instruction) return { ok: false, error: 'Select code and enter an instruction.' }
    userContent = `[Soumtok inline edit — Ctrl+K]
Reply with ONLY the replacement text for the selection (no markdown fences, no explanation).
Language: ${language}
File: ${filePath || 'unknown'}
Instruction: ${instruction || 'Improve this code'}

Selected code:
${selection || '(empty selection)'}`
  } else {
    const relatedBlock = relatedSnippets.length
      ? `\n\nOther open files (context only):\n${relatedSnippets
          .slice(0, 4)
          .map((row) => `--- ${row.path} ---\n${String(row.snippet || '').slice(0, 800)}`)
          .join('\n\n')}`
      : ''
    userContent = `[Soumtok Tab — inline autocomplete]
Reply with ONLY the text to insert at the cursor (single continuation, no fences, no explanation).
Language: ${language}
File: ${filePath || 'unknown'}

Code before cursor:
${prefix.slice(-4000)}

Code after cursor:
${suffix.slice(0, 1200)}${relatedBlock}`
  }

  const body = {
    model: kind === 'tab' ? tabModel : model,
    mode: 'ask',
    driver: 'ide',
    workspaceRoot: folder || undefined,
    openFiles,
    messages: [{ role: 'user', content: userContent }],
    agentPrefs: {
      runMode: 'ask',
      intelligence: 'fast',
      thinkFirst: false,
      browserVerify: false,
      skillsEnabled: false,
    },
  }

  if (kind === 'tab') {
    const complete = await api('POST', '/api/studio/complete', {
      model: tabModel,
      messages: [
        {
          role: 'system',
          content:
            'Code completion only. Return the exact characters to insert at the cursor. No markdown fences. No commentary. One continuation.',
        },
        { role: 'user', content: userContent },
      ],
      temperature: 0.12,
      maxTokens: 128,
    })
    if (complete.status === 200 && complete.data?.text) {
      const text = stripFences(complete.data.text)
      if (text) return { ok: true, text, model: complete.data.model || tabModel, kind }
    }
  }

  let res = await postDesktopAgentRound(api, body)
  if (shouldUseStudioCompleteFallback(res)) {
    return {
      ok: false,
      error: res?.data?.error || 'Sign in to Soumtok and ensure the API is reachable for Tab / Ctrl+K.',
    }
  }
  if (res.status >= 400) {
    return { ok: false, error: res?.data?.error || `API ${res.status}` }
  }
  const raw = res.data?.text || ''
  const text = stripFences(raw)
  if (!text) return { ok: false, error: 'Model returned empty completion.' }
  return { ok: true, text, model: res.data?.model || model, kind }
}

module.exports = { runEditorAiAssist }
