import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import process from 'node:process'
import { brand, c } from './ansi.mjs'
import { formatTurnUsage } from './usage.mjs'

function clip(text, max = 280) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function toolLabel(name, args) {
  const n = String(name || 'tool')
  if (n === 'read' && args?.path) return `read ${args.path}`
  if (n === 'write' && args?.path) return `write ${args.path}`
  if (n === 'diff' && args?.path) return `edit ${args.path}`
  if (n === 'grep' && args?.pattern) return `grep ${clip(args.pattern, 40)}`
  if (n === 'glob' && args?.pattern) return `glob ${args.pattern}`
  if (n === 'list_dir' && args?.path) return `list ${args.path || '.'}`
  if (n === 'terminal' && args?.command) return `$ ${clip(args.command, 72)}`
  if (n === 'read_terminal') return 'read terminal output'
  if (n === 'git' && args?.command) return `git ${args.command}`
  if (n === 'codebase_search') return `search ${clip(args?.query || args?.pattern, 48)}`
  if (n === 'task') return `subagent ${clip(args?.prompt || args?.description, 48)}`
  if (n === 'generate_image') return 'generate image'
  if (n === 'browser') return `browser ${clip(args?.url || args?.action, 48)}`
  if (n === 'fetch' || n === 'web_fetch') return `fetch ${clip(args?.url, 48)}`
  if (n === 'mcp') return `mcp ${args?.tool || args?.name || ''}`.trim()
  return n
}

export function createEventPrinter({ onAsk, cwd, usageSummary = 'auto', stream = true, jsonMode = false } = {}) {
  let assistantBuf = ''
  let lastModel = ''
  let filesEdited = 0
  let toolRound = 0
  let liveStatus = ''
  const runningTools = []
  const collected = []
  let streamStarted = false

  function flushAssistant() {
    if (streamStarted) {
      process.stdout.write('\n')
      assistantBuf = ''
      streamStarted = false
      return
    }
    if (!assistantBuf.trim()) return
    console.log('')
    for (const line of assistantBuf.trim().split('\n')) {
      console.log(line)
    }
    assistantBuf = ''
  }

  return {
    reset() {
      assistantBuf = ''
      filesEdited = 0
      toolRound = 0
      liveStatus = ''
      runningTools.length = 0
    },
    liveStatus: () => liveStatus,
    events: () => collected,
    handle(ev) {
      if (!ev || !ev.type) return
      collected.push(ev)
      if (jsonMode) return
      switch (ev.type) {
        case 'status':
          flushAssistant()
          streamStarted = false
          liveStatus = ev.text || ev.message || 'Working…'
          console.log(c.dim(`◆ ${liveStatus}`))
          break
        case 'assistant':
          if (stream) {
            const chunk = ev.delta || ev.text || ''
            if (chunk) {
              if (!streamStarted) {
                process.stdout.write('\n')
                streamStarted = true
              }
              process.stdout.write(chunk)
              assistantBuf += chunk
            }
          } else {
            if (ev.text) assistantBuf += ev.text
            if (ev.delta) assistantBuf += ev.delta
          }
          if (ev.model) lastModel = ev.model
          break
        case 'tool': {
          flushAssistant()
          toolRound += 1
          const args = ev.args || ev.arguments || {}
          const label = toolLabel(ev.name, args)
          runningTools.push(ev.name)
          console.log(c.cyan(`  ▸ ${label}`))
          if (ev.contentPreview) console.log(c.dim(`    ${clip(ev.contentPreview, 100)}`))
          break
        }
        case 'result': {
          const n = String(ev.name || '').toLowerCase()
          if (/^(write|diff|edit|str_replace|apply_patch)$/.test(n)) filesEdited += 1
          if (n === 'generate_image' && ev.ok && (ev.path || ev.image)) {
            console.log(c.green(`    🖼 saved ${ev.path || 'assets/generated/'}`))
          } else if (ev.ok === false) {
            console.log(c.red(`    ✗ ${clip(ev.text || ev.error, 160)}`))
          } else if (ev.path && /^(write|diff|edit)$/.test(n)) {
            const delta =
              ev.linesAdded != null || ev.linesRemoved != null
                ? ` (+${ev.linesAdded || 0}/-${ev.linesRemoved || 0})`
                : ''
            console.log(c.green(`    ✎ ${ev.path}${delta}`))
          } else if (n === 'terminal' && ev.text) {
            const tail = String(ev.text).split('\n').slice(-5).join('\n')
            if (tail.trim()) console.log(c.dim(`    ${clip(tail, 200)}`))
          } else if (ev.text && n === 'read') {
            console.log(c.dim(`    ${clip(ev.text, 120)}`))
          }
          if (runningTools.length) runningTools.pop()
          break
        }
        case 'file':
          filesEdited += 1
          console.log(c.blue(`  📄 ${ev.path || ev.file}`))
          break
        case 'todo':
          if (Array.isArray(ev.todos)) {
            console.log(c.dim('  todos'))
            for (const t of ev.todos.slice(0, 8)) {
              const mark = t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '→' : '○'
              console.log(c.dim(`    ${mark} ${t.content || t.id}`))
            }
          }
          break
        case 'checkpoint':
          console.log(c.dim(`  ⊞ checkpoint ${(ev.paths || []).length} path(s)`))
          break
        case 'mode_switch':
          console.log(
            c.yellow(`  ◇ ${ev.target || 'agent'}${ev.explanation ? ` · ${clip(ev.explanation, 100)}` : ''}`),
          )
          break
        case 'plan_file':
          console.log(c.green(`  📋 Plan saved → ${ev.path || 'PLAN.md'} (send BUILD to execute)`))
          break
        case 'canvas':
          console.log(c.green(`  🎨 Canvas → ${ev.path || 'CANVAS.md'} · ${ev.title || 'Design'}`))
          break
        case 'workspace_refresh':
          console.log(c.dim('  ↻ workspace refreshed'))
          break
        case 'ask':
          if (typeof onAsk === 'function') onAsk(ev)
          break
        default:
          break
      }
      if (ev.model) lastModel = ev.model
    },
    footer(result = {}) {
      flushAssistant()
      const usageLine = formatTurnUsage({ ...result, model: result.model || lastModel })
      const note = result.note ? ` · ${clip(result.note, 60)}` : ''
      const err = result.error && result.error !== 'Cancelled' ? c.red(` · ${result.error}`) : ''
      console.log('')
      if (usageLine && usageSummary !== 'never') {
        console.log(c.dim(`${usageLine} · synced to Dashboard → Usage`))
      }
      console.log(
        c.dim(
          `${toolRound} tool round${toolRound === 1 ? '' : 's'} · ${filesEdited} file${filesEdited === 1 ? '' : 's'} edited${note}`,
        ) + (err || ''),
      )
      if (result.incomplete) console.log(c.yellow('Run incomplete — say "continue" to keep going.'))
    },
  }
}

export async function promptAsk(ev, resolveAskReply) {
  console.log('')
  console.log(brand(ev.title || 'Question'))
  if (ev.intro) console.log(c.dim(ev.intro))
  const rl = readline.createInterface({ input, output })
  const answers = {}
  try {
    for (const q of ev.questions || []) {
      console.log('')
      console.log(c.bold(q.prompt))
      const options = q.options || []
      options.forEach((opt, i) => console.log(c.dim(`  ${i + 1}. ${opt.label}`)))
      if (q.allowCustom !== false) console.log(c.dim('  (or type your own answer)'))
      const raw = await rl.question(c.orange('→ '))
      const pick = raw.trim()
      if (!pick) continue
      const idx = Number(pick) - 1
      if (Number.isInteger(idx) && options[idx]) {
        answers[q.id] = q.allowMultiple ? [options[idx].id] : options[idx].id
      } else {
        answers[q.id] = q.allowMultiple ? [pick] : pick
      }
    }
  } finally {
    rl.close()
  }
  resolveAskReply(ev.id, answers)
}
