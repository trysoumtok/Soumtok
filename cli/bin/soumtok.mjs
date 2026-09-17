#!/usr/bin/env node
import { parseArgs } from 'node:util'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import fs from 'node:fs'
import path from 'node:path'
import { brand, box, c, hr } from '../lib/ansi.mjs'
import { createApiClient } from '../lib/api.mjs'
import { ensureAuth, loginCommand, loginWithApiKeyCommand } from '../lib/auth.mjs'
import {
  loadConfig,
  loadThread,
  resolveCwd,
  saveConfig,
  saveThread,
} from '../lib/config.mjs'
import { driverLabel, modeLabel } from '../lib/desktop-parity.mjs'
import {
  formatJsonOutput,
  pushAgentSteer,
  runAgentPrompt,
  runChatTurn,
  newThreadId,
} from '../lib/harness.mjs'
import { listThreads, printThreadHistory } from '../lib/history.mjs'
import { fetchAccountUsage, printAccountUsage } from '../lib/usage.mjs'

const CLI_VERSION = '0.1.0'

const HELP = `
${brand('Soumtok')} ${c.dim('Agent in your terminal — same harness & tools as Desktop')}

${c.bold('Usage')}
  soumtok                      Interactive agent chat
  soumtok agent "<prompt>"     One-shot run
  soumtok login                Browser sign-in (same as Desktop)
  soumtok login --api-key <k>  Dashboard API key
  soumtok models               Model catalog
  soumtok whoami               Account

${c.bold('Flags')}
  --cwd <path>       Workspace folder
  --model <id>       Model or auto
  --mode <mode>      agent | ask | plan | debug
  --driver <d>       ide | bot  (IDE Agent vs Soumtok Bot)
  --intelligence <i> fast | balanced | max

${c.bold('In chat')}
  @src/file.ts       Attach file to context (like Desktop open files)
  !npm test          Shell in workspace
  /models /mode /model /driver /intelligence /cwd /usage
  /steer <text>      Steer running agent (Desktop steer)
  /cancel            Stop current run (Ctrl+C also)
  /threads /history  Saved chat history (local + model tokens)
  /thread <id>       Switch thread
  /clear /exit

  soumtok agent --json "…"   CI/script output (exit 1 on hard fail)

${c.bold('Env')}  SOUMTOK_API_KEY  SOUMTOK_API  SOUMTOK_CWD
`

function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean', short: 'h' },
      signup: { type: 'boolean' },
      'api-key': { type: 'string' },
      cwd: { type: 'string' },
      model: { type: 'string', short: 'm' },
      mode: { type: 'string' },
      driver: { type: 'string' },
      intelligence: { type: 'string' },
      api: { type: 'string' },
      json: { type: 'boolean' },
      'no-stream': { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  })
  const cmd = positionals[0] || 'chat'
  const rest = positionals.slice(1)
  return { values, cmd, rest }
}

function header({ cwd, model, mode, driver, user }) {
  const who = user?.name || user?.email || 'Signed in'
  const short = cwd.length > 32 ? `…${cwd.slice(-30)}` : cwd
  console.log('')
  console.log(
    box('Soumtok Agent', [
      c.dim(who),
      `${brand('◆')} ${c.cyan(model || 'auto')} · ${modeLabel(mode)} · ${driverLabel(driver)}`,
      c.dim(short),
    ]),
  )
  console.log(c.dim('→ Ask, plan, build anything.  @ files · ! shell · /commands'))
  console.log(hr())
}

async function cmdModels(apiOverride) {
  await ensureAuth()
  const models = await createApiClient(apiOverride).models()
  console.log('')
  for (const m of models) {
    const ready = m.ready !== false ? c.green('ready') : c.red('needs key')
    console.log(`  ${c.cyan(String(m.id).padEnd(22))} ${c.dim(m.provider || '')}  ${ready}`)
  }
  console.log('')
}

async function cmdWhoami(apiOverride) {
  const user = await createApiClient(apiOverride).session()
  if (!user) {
    console.log(c.yellow('Not signed in. Run soumtok login'))
    process.exit(1)
  }
  console.log(`${user.name || user.email}`)
  if (user.email && user.name) console.log(c.dim(user.email))
}

async function cmdAgent(prompt, opts) {
  if (!prompt?.trim()) {
    console.error(c.red('Missing prompt. Example: soumtok agent "fix the login bug"'))
    process.exit(1)
  }
  await ensureAuth({ apiKeyFlag: opts.values['api-key'] })
  const cwd = resolveCwd(opts.values.cwd)
  const config = loadConfig()
  const model = opts.values.model || config.model
  const mode = opts.values.mode || config.mode
  const driver = opts.values.driver || config.driver
  const jsonMode = Boolean(opts.values.json)
  const user = jsonMode ? null : await createApiClient(opts.values.api).session()
  if (!jsonMode) header({ cwd, model, mode, driver, user })

  const ac = new AbortController()
  process.once('SIGINT', () => {
    console.log(c.yellow('\nCancelling…'))
    ac.abort()
  })

  const result = await runAgentPrompt({
    prompt: prompt.trim(),
    cwd,
    model,
    mode,
    driver,
    apiOverride: opts.values.api,
    signal: ac.signal,
    config: opts.values.intelligence ? { intelligence: opts.values.intelligence } : {},
    jsonMode,
    stream: !opts.values['no-stream'] && !jsonMode,
  })
  if (jsonMode) {
    console.log(JSON.stringify(formatJsonOutput(result), null, 2))
    if (result.error && result.error !== 'Cancelled' && !result.text) process.exit(1)
    return
  }
  if (result.error && result.error !== 'Cancelled' && !result.text) {
    console.error(c.red(result.error))
    process.exit(1)
  }
}

async function interactiveChat(opts) {
  const authed = await ensureAuth({ apiKeyFlag: opts.values['api-key'] })
  let config = loadConfig()
  if (opts.values.intelligence) config = saveConfig({ intelligence: opts.values.intelligence })
  let cwd = resolveCwd(opts.values.cwd)
  let model = opts.values.model || config.model || 'auto'
  let mode = opts.values.mode || config.mode || 'agent'
  let driver = opts.values.driver || config.driver || 'ide'
  const client = createApiClient(opts.values.api)
  let user = authed || (await client.session())
  if (!user) {
    console.error(c.red('Session not active. Run soumtok login again.'))
    process.exit(1)
  }
  let thread = loadThread(newThreadId())
  thread.id = thread.id || newThreadId()
  thread.title = thread.title || 'New Agent'
  thread.model = thread.model || model
  thread.mode = thread.mode || mode
  thread.driver = thread.driver || driver

  header({ cwd, model, mode, driver, user })

  let agentAbort = null
  let agentBusy = false

  const rl = readline.createInterface({ input, output, terminal: true })

  process.on('SIGINT', () => {
    if (agentBusy && agentAbort) {
      console.log(c.yellow('\nCancelling agent…'))
      agentAbort.abort()
      return
    }
    rl.close()
    saveThread(thread)
    console.log(c.dim('\nBye.'))
    process.exit(0)
  })

  while (true) {
    let line
    try {
      line = await rl.question(agentBusy ? c.dim('\n(steer with /steer … or wait)\n→ ') : c.orange('\n→ '))
    } catch {
      break
    }
    const text = line.trim()
    if (!text) continue

    if (text.startsWith('/')) {
      const [cmd, ...args] = text.slice(1).split(/\s+/)
      if (cmd === 'exit' || cmd === 'quit') break
      if (cmd === 'cancel') {
        if (agentAbort) agentAbort.abort()
        else console.log(c.dim('No run in progress.'))
        continue
      }
      if (cmd === 'steer') {
        const msg = args.join(' ').trim()
        if (!msg) {
          console.log(c.dim('Usage: /steer continue with tests'))
          continue
        }
        pushAgentSteer(msg)
        console.log(c.dim('Steer queued.'))
        continue
      }
      if (cmd === 'clear') {
        thread = { id: newThreadId(), title: 'New Agent', messages: [], model, mode, driver }
        console.log(c.dim('New thread.'))
        continue
      }
      if (cmd === 'threads') {
        for (const t of listThreads()) {
          console.log(c.dim(`  ${t.id}  ${t.title}  (${t.turns || 0} turns)`))
        }
        continue
      }
      if (cmd === 'history') {
        if (!printThreadHistory(thread)) console.log(c.dim('No history in this thread yet.'))
        continue
      }
      if (cmd === 'thread' && args[0]) {
        thread = loadThread(args[0])
        model = thread.model || model
        mode = thread.mode || mode
        driver = thread.driver || driver
        console.log(c.dim(`Thread → ${thread.title || thread.id}`))
        continue
      }
      if (cmd === 'models') {
        await cmdModels(opts.values.api)
        continue
      }
      if (cmd === 'usage') {
        try {
          const summary = await fetchAccountUsage(createApiClient(opts.values.api))
          printAccountUsage(summary)
        } catch (err) {
          console.log(c.red(err.message || String(err)))
        }
        continue
      }
      if (cmd === 'usage-always') {
        saveConfig({ usageSummary: 'always' })
        console.log(c.dim('Will show full account usage after each run.'))
        continue
      }
      if (cmd === 'usage-never') {
        saveConfig({ usageSummary: 'never' })
        console.log(c.dim('Token line hidden after runs (still billed on your account).'))
        continue
      }
      if (cmd === 'mode' && args[0]) {
        mode = args[0]
        saveConfig({ mode })
        thread.mode = mode
        console.log(c.dim(`Mode → ${modeLabel(mode)}`))
        continue
      }
      if (cmd === 'model' && args[0]) {
        model = args[0]
        saveConfig({ model })
        thread.model = model
        console.log(c.dim(`Model → ${model}`))
        continue
      }
      if (cmd === 'driver' && args[0]) {
        driver = args[0] === 'bot' ? 'bot' : 'ide'
        saveConfig({ driver })
        thread.driver = driver
        console.log(c.dim(`Driver → ${driverLabel(driver)}`))
        continue
      }
      if (cmd === 'intelligence' && args[0]) {
        saveConfig({ intelligence: args[0] })
        console.log(c.dim(`Intelligence → ${args[0]}`))
        continue
      }
      if (cmd === 'cwd' && args[0]) {
        cwd = path.resolve(args.join(' '))
        console.log(c.dim(`Workspace → ${cwd}`))
        continue
      }
      if (cmd === 'login') {
        await loginCommand({ api: opts.values.api })
        user = await client.session()
        continue
      }
      console.log(c.dim('Try /models /mode /driver /steer /cancel /threads /clear /exit'))
      continue
    }

    if (text.startsWith('!')) {
      const { createIntegratedTerminalRunner } = await import('../lib/terminal-run.mjs')
      const term = createIntegratedTerminalRunner(cwd)
      term.onIntegratedTerminalRun({ cwd, command: text.slice(1).trim() })
      console.log(c.dim('Shell command sent (same integrated terminal capture as Desktop).'))
      continue
    }

    agentBusy = true
    agentAbort = new AbortController()
    try {
      const result = await runChatTurn({
        prompt: text,
        thread,
        cwd,
        model,
        mode,
        driver,
        apiOverride: opts.values.api,
        signal: agentAbort.signal,
      })
      thread = saveThread(result.thread)
      if (result.error && result.error !== 'Cancelled' && !result.text) {
        console.log(c.red(result.error))
      }
    } catch (err) {
      const msg = err.message || String(err)
      if (msg !== 'Cancelled' && !/abort/i.test(msg)) console.log(c.red(msg))
      if (/401|sign in/i.test(msg)) {
        await loginCommand({ api: opts.values.api })
        user = await client.session()
      }
    } finally {
      agentBusy = false
      agentAbort = null
    }
  }

  rl.close()
  saveThread(thread)
  console.log(c.dim('\nBye.'))
}

const KNOWN = new Set(['chat', 'agent', 'login', 'models', 'whoami', 'help', 'update', 'version'])

async function main() {
  const opts = parseCli(process.argv.slice(2))
  if (opts.values.help) {
    console.log(HELP)
    return
  }

  if (!KNOWN.has(opts.cmd)) {
    await cmdAgent([opts.cmd, ...opts.rest].join(' '), opts)
    return
  }

  if (opts.cmd === 'login') {
    if (opts.values['api-key']) await loginWithApiKeyCommand(opts.values['api-key'])
    else await loginCommand({ api: opts.values.api, signup: opts.values.signup })
    return
  }
  if (opts.cmd === 'models') {
    await cmdModels(opts.values.api)
    return
  }
  if (opts.cmd === 'whoami') {
    await cmdWhoami(opts.values.api)
    return
  }
  if (opts.cmd === 'version' || opts.cmd === 'update') {
    console.log(`Soumtok CLI v${CLI_VERSION}`)
    if (opts.cmd === 'update') {
      console.log(c.dim('Re-run the install script from soumtok.com/download#terminal to update.'))
      console.log(c.dim("PowerShell: irm 'https://soumtok.com/install/cli.ps1' | iex"))
    }
    return
  }
  if (opts.cmd === 'agent') {
    await cmdAgent(opts.rest.join(' ').trim(), opts)
    return
  }
  await interactiveChat(opts)
}

main().catch((err) => {
  console.error(c.red(err.message || String(err)))
  process.exit(1)
})
