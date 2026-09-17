const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const { resolveToolName, closestName } = require('../shared/typoIntent.js')
const {
  parseStillRequest,
  normalizeStillAspect,
  stillAspectForImageUse,
  DEFAULT_STILL_ASPECT,
} = require('../shared/stillAspect.js')
const { normalizeWorkspaceEditArgs } = require('../shared/toolArgsRuntime.js')
const { classifyFile, extractFileContent } = require('./documentExtract')

const BLOCK_SHELL =
  /[;&|`]|\$\(|&&|\|\||\brm\b|\bdel\b|\bformat\b|\bcurl\b|\bwget\b|\bssh\b|\breg\b|\binvoke-webrequest/i

function stripQuotedStrings(cmd) {
  return String(cmd || '').replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""').replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "''")
}

/** Block shell metacharacters but allow `=>` inside node -e and quoted strings. */
function commandBlocked(cmd) {
  const raw = String(cmd || '').trim()
  if (!raw) return true
  const head = raw.split(/\s+/)[0]?.toLowerCase() || ''
  if (head === 'node' && /\s-e(\s|=)/.test(raw)) {
    const bare = stripQuotedStrings(raw)
    if (/>>|\s>\s*[\w./\\~]/.test(bare)) return true
    return BLOCK_SHELL.test(bare)
  }
  return BLOCK_SHELL.test(raw) || /(?<![=-])>(?![=])/.test(stripQuotedStrings(raw))
}

/** Run-everything / permissive: real local shell — allow pipes (netstat | findstr), block only risky chaining. */
function commandBlockedPermissive(cmd) {
  const raw = String(cmd || '').trim()
  if (!raw) return true
  const bare = stripQuotedStrings(raw)
  if (/\|\|/.test(bare) && !/\|\s*findstr\b/i.test(raw) && !/\|\s*Select-String\b/i.test(raw)) {
    return true
  }
  if (/`/.test(bare)) return true
  if (/\$\(/.test(bare)) return true
  if (/\bformat\s+[a-z]:/i.test(bare)) return true
  const withoutRedirects = bare
    .replace(/\d*>&\d+/g, '')
    .replace(/\*>&1\b/g, '')
    .replace(/\*>\s*[\w./\\~-]+\.(txt|log|out|json)\b/gi, '')
    .replace(/>\s*[\w./\\~-]+\.(txt|log|out|json|xml)\b/gi, '')
  if (/(?<![=-])>(?![=])/.test(withoutRedirects) && !/\|\s/.test(raw)) return true
  if (/\brm\s+-[a-z]*rf\s+[\\/]/i.test(bare) || /\bdel\s+\/s\s+\/q\s+[cC]:\\/i.test(bare)) return true
  return false
}
const ALLOW_HEAD =
  /^(node|nodejs|python|python3|py|npm|npx|pnpm|yarn|bun|turbo|git|echo|ls|dir|type|cat|pwd|whoami|mkdir|md|touch)\b/i

const NPM_RUN_SCRIPTS =
  /^(test|build|lint|typecheck|check|dev|start|serve|preview|watch|postinstall|preinstall|dev:.+|web|api|desktop|studio)$/i

const { applyRunModeToPrefs } = require('../shared/agentPrefsRuntime')
const { readLogsForCwd, waitForLogGrowth, appendWorkspaceLog } = require('./terminalLog')
const { runGitTool } = require('./gitTools')
const { publishFolderToGithub } = require('./gitPublish')
const { searchCodebase, invalidateIndex } = require('./semanticIndex')
const { runBrowserTool } = require('./agentBrowser')
const { readSkillByName } = require('./agentSkills')

const DEFAULT_PREFS = {
  workspaceBoundary: true,
  fileDeletionProtection: true,
  terminalSandbox: 'permissive',
  webFetchTool: false,
  webSearchTool: false,
  mcpConnectors: true,
  localToolsEnabled: true,
}

function mergePrefs(prefs) {
  return applyRunModeToPrefs({ ...DEFAULT_PREFS, ...(prefs && typeof prefs === 'object' ? prefs : {}) })
}

function stripOuterQuotes(s) {
  const t = String(s || '').trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1)
  }
  return t
}

/** Model used sed/cat/Get-Content in terminal — those are read() calls, not a shell job. */
function parseFileReadViaShell(command) {
  let c = String(command || '').trim()
  if (!c) return null
  c = c.replace(/^cd\s+\/d\s+("[^"]+"|'[^']+'|[^\s&|;]+)\s*(?:&&|;)\s*/i, '')
  c = c.replace(/^cd\s+("[^"]+"|'[^']+'|[^\s&|;]+)\s*(?:&&|;)\s*/i, '')
  c = c.replace(/^cmd(?:\.exe)?\s+\/[dD]\s+\/[sS]\s+\/[cC]\s+/i, '')
  c = stripOuterQuotes(c)
  c = c.replace(/^powershell(?:\.exe)?\s+(?:-[A-Za-z]+\s+)*(-Command\s+)?/i, '')
  c = stripOuterQuotes(c)

  let m = c.match(/^sed\s+-n\s+(\d+)\s*,\s*(\d+)p\s+(.+)$/i)
  if (m) return { path: stripOuterQuotes(m[3]), startLine: Number(m[1]), endLine: Number(m[2]) }

  m = c.match(/^sed\s+-n\s+['"]?(\d+)\s*,\s*(\d+)p['"]?\s+(.+)$/i)
  if (m) return { path: stripOuterQuotes(m[3]), startLine: Number(m[1]), endLine: Number(m[2]) }

  m = c.match(/Get-Content\s+(?:-(?:Path|LiteralPath)\s+)?("[^"]+"|'[^']+'|[^\s|;]+)/i)
  if (m) {
    const skip = c.match(/-Skip\s+(\d+)/i)
    const inList = c.match(/-in\s+([\d,\s]+)/i)
    const nums = inList
      ? inList[1]
          .split(/[,\s]+/)
          .map(Number)
          .filter((n) => n > 0)
      : []
    return {
      path: stripOuterQuotes(m[1]),
      startLine: nums.length ? Math.min(...nums) : skip ? Number(skip[1]) + 1 : undefined,
      endLine: nums.length ? Math.max(...nums) : undefined,
    }
  }

  m = c.match(/^(?:type|cat|more)\s+(.+?)$/i)
  if (m && !/[|&<>]/.test(m[1])) return { path: stripOuterQuotes(m[1].trim()) }

  m = c.match(/^head\s+-n\s+(\d+)\s+(.+)$/i)
  if (m) return { path: stripOuterQuotes(m[2]), endLine: Number(m[1]) }

  return null
}

/** Windows `start … cmd /k …` opens a separate console — extract the inner command for integrated Terminal. */
function unwrapExternalWindowsTerminal(cmd) {
  const raw = String(cmd || '').trim()
  if (!/^start\b/i.test(raw)) return { ok: true, cmd: raw }

  const cmdIdx = raw.search(/\bcmd(?:\.exe)?\b/i)
  if (cmdIdx >= 0) {
    const tail = raw.slice(cmdIdx)
    const km = tail.match(/^cmd(?:\.exe)?\s+\/[kK]\s+([\s\S]+)$/i)
    if (km) return { ok: true, cmd: stripOuterQuotes(km[1].trim()), rewritten: true }
    const cm = tail.match(/^cmd(?:\.exe)?\s+\/[cC]\s+([\s\S]+)$/i)
    if (cm) return { ok: true, cmd: stripOuterQuotes(cm[1].trim()), rewritten: true }
  }

  const psIdx = raw.search(/\bpowershell(?:\.exe)?\b/i)
  if (psIdx >= 0) {
    const tail = raw.slice(psIdx)
    const pm = tail.match(/^powershell(?:\.exe)?\s+(?:-[a-zA-Z]+\s+)*(.+)$/i)
    if (pm) return { ok: true, cmd: stripOuterQuotes(pm[1].trim()), rewritten: true }
  }

  if (/\bcmd(?:\.exe)?\b/i.test(raw) || /\bpowershell\b/i.test(raw)) {
    return {
      ok: false,
      text:
        'Do not use Windows start cmd/powershell — run the inner command only (e.g. npm run dev:api). Soumtok runs it in the bottom Terminal panel, not a separate cmd.exe window.',
    }
  }
  return { ok: true, cmd: raw }
}

function normalizeTerminalCommand(command, root) {
  let cmd = String(command || '').trim()
  let cwdRel = ''
  const cdThen = cmd.match(
    /^(?:cd(?:\s+\/d)?|Set-Location(?:\s+-LiteralPath)?)\s+("[^"]+"|'[^']+'|[^\s&|;]+)\s*(?:&&|;)\s*(.+)$/i,
  )
  if (cdThen) {
    cwdRel = String(cdThen[1] || '').replace(/^['"]|['"]$/g, '')
    cmd = cdThen[2].trim()
  }
  if (/^cd\s+/i.test(cmd) && !/[;&|]/.test(cmd)) {
    return { ok: false, text: 'Pass cwd on terminal({ command, cwd }) instead of a bare cd.' }
  }
  if (process.platform === 'win32' && /\s&&\s/.test(cmd)) {
    cmd = cmd.replace(/\s*&&\s*/g, '; ')
  }
  if (/^start\s+\/b\b/i.test(cmd)) {
    let inner = cmd.replace(/^start\s+\/b\s+/i, '').trim()
    inner = inner.replace(/\s*>\s*[\w./\\~-]+\.log\s*(\s*2>&1)?\s*$/i, '').trim()
    if (inner && inner !== cmd) {
      return { ok: true, cmd: inner, note: 'Rewrote start /b log redirect → run in integrated Terminal (use read_terminal).' }
    }
  }
  if (/\bdev-(launch|api-only)\.mjs\b/i.test(cmd)) {
    return {
      ok: false,
      text:
        'That dev script opens an external Windows cmd window. Use npm run dev (or npm run dev --workspace=…) — Soumtok runs it in the bottom Terminal panel only.',
    }
  }
  const unwrapped = unwrapExternalWindowsTerminal(cmd)
  if (!unwrapped.ok) return unwrapped
  cmd = unwrapped.cmd
  if (unwrapped.rewritten) {
    return { ok: true, cmd, note: 'Rewrote Windows start cmd → integrated Terminal command.' }
  }
  const cmdC = cmd.match(/^cmd(?:\.exe)?\s+\/[dD]\s+\/[sS]\s+\/[cC]\s+([\s\S]+)$/i)
  if (cmdC) {
    const inner = stripOuterQuotes(cmdC[1].trim())
    if (inner && inner !== cmd) {
      const nested = normalizeTerminalCommand(inner, root)
      if (!nested.ok) return nested
      return { ok: true, cmd: nested.cmd, cwdRel: nested.cwdRel || cwdRel, note: nested.note || 'Unwrapped cmd /c → integrated Terminal command.' }
    }
  }
  if (/node\s+-e\b/i.test(cmd) && /\b(execSync|spawnSync|spawn|fork|detached)\b/i.test(cmd)) {
    const npmRun = cmd.match(/npm\s+run\s+[a-z0-9:_-]+/i)
    if (npmRun) {
      return {
        ok: true,
        cmd: npmRun[0],
        note: 'Rewrote node -e spawn hack → npm script in integrated Terminal (use read_terminal for output).',
      }
    }
    return {
      ok: false,
      text:
        'Do not start servers with node -e execSync/spawn. Use terminal("npm run dev:api") or terminal("npm run dev:web") from package.json, then read_terminal(wait_ms).',
    }
  }
  if (/node\s+-e\b/i.test(cmd) && /\bwriteFileSync\s*\(\s*['"][^'"]*-run\.log/i.test(cmd)) {
    return {
      ok: false,
      text: 'Do not capture dev servers into *-run.log via node -e. Use terminal(npm run …) and read_terminal() — Soumtok records the integrated Terminal.',
    }
  }
  if (process.platform === 'win32' && /\$[a-z_@]|Get-Content|Set-Content|ForEach-Object|Get-ChildItem|Get-Location|Select-Object|@\s*'|@\s*"/i.test(cmd)) {
    return {
      ok: true,
      cmd,
      note: 'PowerShell command — running via powershell.exe in integrated Terminal (not cmd.exe).',
      shell: 'powershell',
    }
  }
  return { ok: true, cmd, cwdRel }
}

function windowsExecSpec(command, shellHint) {
  const c = String(command || '').trim()
  const usePs =
    shellHint === 'powershell' ||
    (shellHint !== 'cmd' &&
      /\$[a-z_@]|Get-Content|Set-Content|ForEach-Object|Get-ChildItem|Get-Location|Select-Object|@\s*'|@\s*"/i.test(c))
  if (usePs) {
    return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', c] }
  }
  return { file: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', c] }
}

function assertInRoot(root, target) {
  const resolved = path.resolve(root, target)
  const rel = path.relative(path.resolve(root), resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path outside workspace')
  return resolved
}

function resolvePath(root, target, prefs) {
  const rel = String(target || '.').replace(/^\/+/, '') || '.'
  if (prefs.workspaceBoundary === false) return path.resolve(root, rel)
  return assertInRoot(root, rel)
}

/** Prefer src/ for bare component filenames when src/ exists (matches diff locateWorkspaceFile). */
function resolveWritePath(root, relIn, prefs) {
  const raw = String(relIn || '').replace(/^\/+/, '').replace(/\\/g, '/')
  if (!raw) throw new Error('path required')
  try {
    const direct = resolvePath(root, raw, prefs)
    if (fs.existsSync(direct)) return { file: direct, rel: raw }
  } catch {
    /* try src/ fallback */
  }
  const base = path.posix.basename(raw)
  const isSource = /\.(ts|tsx|js|jsx|mjs|cjs|css|html|vue|svelte)$/i.test(base)
  if (isSource && !raw.includes('/')) {
    try {
      const srcDir = resolvePath(root, 'src', prefs)
      if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
        const srcRel = `src/${base}`
        return { file: resolvePath(root, srcRel, prefs), rel: srcRel }
      }
    } catch {
      /* fall through */
    }
  }
  return { file: resolvePath(root, raw, prefs), rel: raw }
}

function mimeFromExt(ext) {
  const e = String(ext || '').toLowerCase().replace(/^\./, '')
  if (e === 'png') return 'image/png'
  if (e === 'webp') return 'image/webp'
  if (e === 'gif') return 'image/gif'
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg'
  if (e === 'svg') return 'image/svg+xml'
  if (e === 'mp4') return 'video/mp4'
  if (e === 'webm') return 'video/webm'
  if (e === 'mov') return 'video/quicktime'
  if (e === 'pdf') return 'application/pdf'
  if (e === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return ''
}

function resolveReadablePath(root, relIn, prefs) {
  const rel = String(relIn || '').replace(/^\/+/, '')
  try {
    return resolvePath(root, rel, prefs)
  } catch (e) {
    const base = path.basename(rel.replace(/\\/g, '/'))
    if (base && (path.isAbsolute(rel) || /^[a-zA-Z]:[\\/]/.test(rel))) {
      try {
        return resolvePath(root, `.soumtok/inbox/${base}`, prefs)
      } catch {
        /* fall through */
      }
    }
    throw e
  }
}

function slugImageName(prompt, ext) {
  const slug =
    String(prompt || 'image')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'image'
  return `assets/generated/${slug}-${Date.now().toString(36)}.${ext || 'jpg'}`
}

function writeBinaryFile(root, relRaw, buf, prefs) {
  const rel = String(relRaw || '').replace(/^\/+/, '')
  if (!rel) throw new Error('path required')
  const file = resolvePath(root, rel, prefs)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, buf)
  invalidateIndex(root)
  return { file, rel: path.relative(root, file).replace(/\\/g, '/') }
}

function saveMcpArtifacts(root, server, tool, result, prefs) {
  if (!root) return []
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const safeServer = String(server || 'mcp').replace(/[^\w.-]+/g, '_').slice(0, 40)
  const safeTool = String(tool || 'call').replace(/[^\w.-]+/g, '_').slice(0, 40)
  const dirRel = `mcp-exports/${safeServer}`
  const jsonRel = `${dirRel}/${safeTool}-${stamp}.json`
  const text = typeof result === 'string' ? result : JSON.stringify(result ?? {}, null, 2)
  const saved = [writeBinaryFile(root, jsonRel, Buffer.from(text, 'utf8'), prefs).rel]
  const blob = result && typeof result === 'object' ? result : {}
  const content = blob.content || blob.result?.content
  const parts = Array.isArray(content) ? content : []
  for (let i = 0; i < Math.min(parts.length, 8); i++) {
    const part = parts[i]
    if (part?.type === 'image' && part.data) {
      const ext = String(part.mimeType || 'image/png').includes('jpeg') ? 'jpg' : 'png'
      saved.push(
        writeBinaryFile(root, `${dirRel}/${safeTool}-${stamp}-${i}.${ext}`, Buffer.from(String(part.data), 'base64'), prefs)
          .rel,
      )
    }
  }
  return saved
}

function parseSandboxStandard(raw) {
  const command = raw.trim().slice(0, 400)
  if (!command) return null
  if (/^git\s+push\b/i.test(command) && !/[;&|<>`]|\$\(|&&|\|\|/.test(command)) return null
  if (commandBlocked(command) && !/^echo\s/.test(command)) return null
  if (!ALLOW_HEAD.test(command)) return null
  const parts = command.split(/\s+/).filter(Boolean)
  const head = parts[0].toLowerCase()
  const sub = (parts[1] || '').toLowerCase()
  if (head === 'npm' || head === 'pnpm' || head === 'yarn' || head === 'bun') {
    if (parts.includes('-g') || parts.includes('--global') || parts.includes('publish')) return null
    if (head === 'yarn') {
      if (!sub) return null
      if (sub === 'run') {
        const script = parts[2] || ''
        if (!script || !NPM_RUN_SCRIPTS.test(script)) return null
      } else if (!NPM_RUN_SCRIPTS.test(sub) && !['install', 'add'].includes(sub)) return null
    } else {
      if (!['test', 'run', 'install', 'i', 'ci', 'start', 'exec', 'dev'].includes(sub)) return null
      if (sub === 'run') {
        const script = parts[2] || ''
        if (!script || !NPM_RUN_SCRIPTS.test(script)) return null
      }
    }
  }
  if (head === 'node' && sub === '-e') return command.slice(0, 400)
  if (head === 'npx' && !/^(tsc|vite|next|tsx|eslint|prettier|tsx)$/i.test(parts[1] || '')) return null
  if (head === 'git' && !/^(status|log|diff|show|add|commit|clone)$/i.test(parts[1] || '')) return null
  if (head === 'git' && /^commit$/i.test(parts[1] || '') && !parts.some((part) => part === '-m' || part.startsWith('-m'))) {
    return null
  }
  if (head === 'git' && /^clone$/i.test(parts[1] || '')) return null
  return command
}

function isLongRunningTerminalCommand(command) {
  const c = String(command || '').trim()
  if (/^(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|serve|preview|watch)\b/i.test(c)) return true
  if (/^(npm|pnpm|yarn|bun)\s+run\s+\S+/i.test(c)) return true
  if (/^(npm|pnpm|yarn|bun)\s+start\b/i.test(c)) return true
  if (/^(npm|pnpm|yarn|bun)\s+(install|i|ci)\b/i.test(c)) return true
  if (/^(npx|pnpm dlx|yarn dlx)\s+/.test(c) && /\b(dev|start|serve|preview|watch)\b/i.test(c)) return true
  if (/^tsx\s+watch\b/i.test(c)) return true
  if (/^node\s+(server|index|app|main)\.(js|cjs|mjs)\b/i.test(c)) return true
  if (/^node\s+\S+\.(mjs|js|cjs)\b/i.test(c) && !/\b(-e|--eval|test)\b/i.test(c)) return true
  return false
}

function integratedTerminalLikelyHasDevServer(root) {
  const log = readLogsForCwd(root, 12_000)
  if (!log.trim()) return false
  const tail = log.slice(-2500)
  if (/\[Process exited\]/i.test(tail) && !/running at|listening|Ready|localhost:\d+/i.test(tail.slice(-800))) {
    return false
  }
  return /https?:\/\/(?:localhost|127\.0\.0\.1):\d+|running at http|dev server looks READY|Likely URLs:/i.test(log)
}

async function runViaIntegratedTerminal(ctx, root, allowed, normalized, cwd = root) {
  const { waitForLogGrowth, sleep } = require('./terminalLog')
  if (typeof ctx.onIntegratedTerminalRun !== 'function') return null
  const beforeLen = readLogsForCwd(root, 200_000).length
  ctx.onIntegratedTerminalRun({ cwd, command: allowed, newSession: false })
  await sleep(700)
  const long = isLongRunningTerminalCommand(allowed)
  let log = await waitForLogGrowth(root, {
    waitMs: long ? 28_000 : 14_000,
    minChars: long ? 25 : 1,
    pollMs: 350,
  })
  const delta = readLogsForCwd(root, 200_000).length - beforeLen
  if (!long && delta < 8) {
    try {
      const winSpec =
        process.platform === 'win32' ? windowsExecSpec(allowed, normalized.shell) : null
      const result = winSpec
        ? spawnSync(winSpec.file, winSpec.args, {
            cwd,
            encoding: 'utf8',
            windowsHide: true,
            timeout: 180_000,
            maxBuffer: 8 * 1024 * 1024,
          })
        : spawnSync(allowed, {
            shell: true,
            cwd,
            encoding: 'utf8',
            windowsHide: true,
            timeout: 180_000,
            maxBuffer: 8 * 1024 * 1024,
          })
      const out = `${result.stdout || ''}${result.stderr || ''}`.slice(0, 32_000)
      if (out.trim()) {
        appendWorkspaceLog(root, `\r\n[soumtok capture]\r\n${out}\r\n`)
        if (typeof ctx.onTerminalMirror === 'function') {
          ctx.onTerminalMirror({ cwd, command: allowed, output: out })
        }
      }
      log = readLogsForCwd(root, 16_000)
    } catch (e) {
      const out = `${e.stdout || ''}${e.stderr || ''}${e.message || e}`.slice(0, 8000)
      if (out.trim()) appendWorkspaceLog(root, `\r\n[soumtok capture]\r\n${out}\r\n`)
      log = readLogsForCwd(root, 16_000)
    }
  }
  const rewriteNote = normalized.note ? `${normalized.note}\n` : ''
  const urls = log.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+[^\s]*/gi)?.slice(-5).join('\n') || ''
  const errHint = /error|ERR!|failed|EADDRINUSE|cannot find module|EPERM|spawn/i.test(log)
    ? '\n\n(Check Terminal panel output — fix errors there, then retry.)'
    : ''
  if (long) {
    const readyInLog = /dev server looks READY|Likely URLs:/i.test(log)
    const tailFail = /ECONNREFUSED|exit code [1-9]|EPERM|spawn EPERM/i.test(log.slice(-1200))
    return {
      ok: readyInLog || !tailFail,
      text:
        rewriteNote +
        `Running in Soumtok integrated Terminal (bottom panel): ${allowed}\n\n` +
        `--- Terminal output ---\n${log || '(still starting — use read_terminal with wait_ms 15000)'}\n` +
        (urls ? `\nLikely URLs:\n${urls}\n` : '') +
        errHint +
        `\nLive output stays in the Terminal tab (Ctrl+J). Use read_terminal for more lines.`,
    }
  }
  const body = log.trim() || '(command sent — open Terminal panel or read_terminal if you need more output)'
  return {
    ok: !/\bCommand blocked\b/i.test(body) && !/^ERROR:/im.test(body.slice(-1500)),
    text: rewriteNote + body,
  }
}

function runBackgroundCommand(command, root) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    let child
    try {
      if (process.platform === 'win32') {
        const winSpec = windowsExecSpec(command)
        child = spawn(winSpec.file, winSpec.args, {
          cwd: root,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          detached: false,
          env: { ...process.env, FORCE_COLOR: '0' },
        })
      } else {
        child = spawn(command, {
          shell: true,
          cwd: root,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          detached: false,
          env: { ...process.env, FORCE_COLOR: '0' },
        })
      }
    } catch (e) {
      finish({ ok: false, text: String(e.message || e) })
      return
    }
    let out = ''
    const append = (buf) => {
      out += buf.toString()
      if (out.length > 12_000) out = out.slice(-12_000)
    }
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    const summarize = () => {
      const tail = out.trim().slice(-4500) || '(no output yet — server may still be starting)'
      const portHint =
        tail.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/gi)?.slice(-3).join('\n') ||
        'Check package.json scripts (often http://localhost:3000 or :5173).'
      finish({
        ok: true,
        text: `Started in background (pid ${child.pid}).\n\nRecent output:\n${tail}\n\nLikely URL(s):\n${portHint}\n\nUse Soumtok Terminal (Ctrl+J) for live logs.`,
      })
    }
    const timer = setTimeout(summarize, 5000)
    child.on('error', (e) => finish({ ok: false, text: String(e.message || e) }))
    child.on('exit', (code) => {
      if (code !== 0 && code != null && out.trim().length < 40) {
        finish({ ok: false, text: out.trim() || `Process exited with code ${code}` })
      } else if (!settled) summarize()
    })
  })
}

function allowTerminal(command, sandbox) {
  const cmd = command.trim().slice(0, 2000)
  if (!cmd) return null
  if (sandbox === 'permissive') {
    if (commandBlockedPermissive(cmd)) return null
    return cmd
  }
  if (sandbox === 'standard') return parseSandboxStandard(cmd.slice(0, 400))
  if (commandBlocked(cmd) && !/^echo\s/.test(cmd)) return null
  if (!ALLOW_HEAD.test(cmd)) return null
  return cmd.slice(0, 400)
}

function parseArgs(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}
  } catch {
    return { input: String(raw || '') }
  }
}

function grepRipgrep(root, pattern, globHint, limit = 80) {
  const args = [
    '--line-number',
    '--no-heading',
    '--ignore-case',
    '--max-count',
    String(limit),
    '--glob',
    '!node_modules',
    '--glob',
    '!.git',
  ]
  if (globHint) {
    const g = globHint.startsWith('*') ? globHint : `*${globHint}*`
    args.push('--glob', g)
  }
  args.push(pattern, root)
  try {
    const rg = spawnSync('rg', args, {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 25_000,
      maxBuffer: 4 * 1024 * 1024,
    })
    if (rg.error && rg.error.code === 'ENOENT') return null
    const lines = (rg.stdout || '').trim()
    if (rg.status === 0 && lines) return { ok: true, text: lines.slice(0, 48_000) }
    if (rg.status === 1) return { ok: true, text: 'No matches.' }
    if (lines) return { ok: true, text: lines.slice(0, 48_000) }
  } catch {
    return null
  }
  return null
}

function globPatternToRegExp(pattern) {
  const norm = String(pattern || '**/*')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
  const esc = norm.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const re = esc.replace(/\*\*/g, '§§').replace(/\*/g, '[^/]*').replace(/§§/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${re}$`, 'i')
}

function globSearch(root, pattern, limit = 300) {
  let re
  try {
    re = globPatternToRegExp(pattern)
  } catch {
    return { ok: false, text: 'Invalid glob pattern.' }
  }
  const hits = []
  function walk(dir, depth) {
    if (depth > 14 || hits.length >= limit) return
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const full = path.join(dir, entry.name)
      const rel = path.relative(root, full).replace(/\\/g, '/')
      if (entry.isDirectory()) {
        if (re.test(`${rel}/`) || re.test(rel)) hits.push(`${rel}/`)
        walk(full, depth + 1)
      } else if (re.test(rel)) {
        hits.push(rel)
      }
    }
  }
  walk(root, 0)
  return { ok: true, text: hits.length ? [...new Set(hits)].sort().join('\n') : 'No matches.' }
}

function pythonBin() {
  if (process.platform === 'win32') return 'py'
  return 'python3'
}

function workspaceHasPython(root, pathList) {
  if (pathList.some((p) => /\.py$/i.test(p))) return true
  for (const name of ['pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile']) {
    if (fs.existsSync(path.join(root, name))) return true
  }
  return false
}

function readLintsWorkspace(root, args) {
  const pathsArg = args.paths || args.path || ''
  const pathList = String(pathsArg)
    .split(/[,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const pkgPath = path.join(root, 'package.json')
  let scripts = {}
  try {
    scripts = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts || {}
  } catch {
    scripts = {}
  }
  const chunks = []
  if (scripts.lint) {
    const run = spawnSync('npm run lint', {
      shell: true,
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 180_000,
    })
    const out = `${run.stdout || ''}${run.stderr || ''}`.slice(0, 14_000)
    chunks.push(`npm run lint (exit ${run.status})\n${out || '(no output)'}`)
  }
  const tsconfig = path.join(root, 'tsconfig.json')
  if (fs.existsSync(tsconfig)) {
    const run = spawnSync('npx tsc --noEmit', {
      shell: true,
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 180_000,
    })
    const out = `${run.stdout || ''}${run.stderr || ''}`.slice(0, 14_000)
    chunks.push(`tsc --noEmit (exit ${run.status})\n${out || '(no output)'}`)
  }
  if (workspaceHasPython(root, pathList)) {
    const bin = pythonBin()
    const targets = pathList.filter((p) => /\.py$/i.test(p))
    const argsPy = targets.length ? ['-m', 'py_compile', ...targets] : ['-m', 'compileall', '-q', '.']
    const run = spawnSync(bin, argsPy, {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 180_000,
      shell: process.platform === 'win32',
    })
    const out = `${run.stdout || ''}${run.stderr || ''}`.slice(0, 14_000)
    chunks.push(`${bin} ${argsPy.join(' ')} (exit ${run.status})\n${out || '(no output)'}`)
  }
  if (!chunks.length && pathList.length) {
    const run = spawnSync(`npx eslint ${pathList.map((p) => JSON.stringify(p)).join(' ')}`, {
      shell: true,
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 180_000,
    })
    const out = `${run.stdout || ''}${run.stderr || ''}`.slice(0, 14_000)
    chunks.push(`eslint ${pathList.join(' ')} (exit ${run.status})\n${out || '(no output)'}`)
  }
  if (!chunks.length) {
    return { ok: false, text: 'No lint script, tsconfig, or Python files — add eslint, TypeScript, or a .py file.' }
  }
  const ok = !chunks.some((c) => /\(exit [1-9]/.test(c))
  return { ok, text: chunks.join('\n\n') }
}

function grepWalk(root, pattern, globHint, limit = 80) {
  let re
  try {
    re = new RegExp(pattern, 'i')
  } catch {
    return { ok: false, text: `Invalid pattern: ${pattern}` }
  }
  const hits = []
  const hint = (globHint || '').replace(/^\*\./, '').replace(/\*$/, '')

  function walk(dir, depth) {
    if (depth > 8 || hits.length >= limit) return
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, depth + 1)
      } else if (entry.isFile()) {
        const rel = path.relative(root, full).replace(/\\/g, '/')
        if (hint && !rel.includes(hint.replace(/^\./, ''))) continue
        let text = ''
        try {
          text = fs.readFileSync(full, 'utf8')
        } catch {
          continue
        }
        text.split('\n').forEach((line, index) => {
          if (hits.length >= limit) return
          if (re.test(line)) hits.push(`${rel}:${index + 1}: ${line.slice(0, 240)}`)
        })
      }
    }
  }
  walk(root, 0)
  return { ok: true, text: hits.length ? hits.join('\n') : 'No matches.' }
}

function lineDiffParts(prev, next, maxOps = 72) {
  const a = String(prev || '').split(/\r?\n/)
  const b = String(next || '').split(/\r?\n/)
  const m = a.length
  const n = b.length
  if (m > 1200 || n > 1200) {
    const added = Math.max(0, n - m)
    const removed = Math.max(0, m - n)
    const lines = b.slice(0, Math.min(40, maxOps)).map((text) => ({ type: 'add', text }))
    return { added, removed, lines }
  }
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  const ops = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      i--
      j--
      continue
    }
    if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'add', text: b[j - 1] })
      j--
    } else if (i > 0) {
      ops.push({ type: 'del', text: a[i - 1] })
      i--
    }
  }
  ops.reverse()
  const added = ops.filter((o) => o.type === 'add').length
  const removed = ops.filter((o) => o.type === 'del').length
  return { added, removed, lines: ops.slice(0, maxOps) }
}

function editToolResult(rel, prev, next) {
  const { added, removed, lines } = lineDiffParts(prev, next)
  const summary = added || removed ? `Updated ${rel} (+${added} -${removed})` : `Updated ${rel}`
  return {
    ok: true,
    text: summary,
    rel,
    linesAdded: added,
    linesRemoved: removed,
    diffPreview: lines,
  }
}

function countOccurrences(hay, needle) {
  if (!needle) return 0
  let n = 0
  let i = 0
  while (true) {
    const j = hay.indexOf(needle, i)
    if (j < 0) break
    n++
    i = j + Math.max(1, needle.length)
  }
  return n
}

function nearestMatchHint(source, oldS) {
  const needle =
    String(oldS || '')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .find((l) => l.trim().length >= 8) || String(oldS || '').trim().slice(0, 80)
  if (!needle || needle.length < 4) return ''
  const lines = String(source).replace(/\r\n/g, '\n').split('\n')
  const key = needle.trim().slice(0, 40).toLowerCase()
  let bestI = -1
  let bestScore = 0
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase()
    let score = 0
    if (low.includes(key.slice(0, Math.min(16, key.length)))) score = 16
    else {
      const a = low.trim()
      const b = key
      let k = 0
      while (k < Math.min(a.length, b.length) && a[k] === b[k]) k++
      score = k
    }
    if (score > bestScore) {
      bestScore = score
      bestI = i
    }
  }
  if (bestI < 0 || bestScore < 4) return ''
  const from = Math.max(0, bestI - 2)
  const to = Math.min(lines.length, bestI + 6)
  const snippet = lines.slice(from, to).map((l, j) => `${from + j + 1}| ${l}`).join('\n')
  return `Closest match around line ${bestI + 1}:\n${snippet}`
}

function applyOnce(source, oldS, newS) {
  if (!oldS) return null
  const idx = source.indexOf(oldS)
  if (idx < 0) return null
  return source.slice(0, idx) + newS + source.slice(idx + oldS.length)
}

function applyFlexibleLineBlock(source, oldS, newS) {
  const src = String(source).replace(/\r\n/g, '\n')
  const oldLines = String(oldS).replace(/\r\n/g, '\n').split('\n')
  const newBlock = String(newS).replace(/\r\n/g, '\n')
  if (!oldLines.length) return null
  const srcLines = src.split('\n')
  const oldTrim = oldLines.map((l) => l.trimEnd())
  for (let i = 0; i <= srcLines.length - oldLines.length; i++) {
    let ok = true
    for (let k = 0; k < oldLines.length; k++) {
      if (srcLines[i + k].trimEnd() !== oldTrim[k]) {
        ok = false
        break
      }
    }
    if (!ok) continue
    const next = [...srcLines.slice(0, i), ...newBlock.split('\n'), ...srcLines.slice(i + oldLines.length)]
    return source.includes('\r\n') ? next.join('\r\n') : next.join('\n')
  }
  return null
}

function applyDiffDetailed(source, args) {
  const oldS = args.old_string || args.search || args.find || ''
  const newS = args.new_string || args.replace || args.new || ''
  const full = args.content || args.body || ''
  if (full) return { ok: true, next: full, count: 1, fuzzy: false }
  if (!oldS) return { ok: false, reason: 'empty', count: 0 }

  const nExact = countOccurrences(source, oldS)
  if (nExact > 1) return { ok: false, reason: 'ambiguous', count: nExact }
  if (nExact === 1) {
    return { ok: true, next: applyOnce(source, oldS, newS), count: 1, fuzzy: false }
  }

  const srcLf = String(source).replace(/\r\n/g, '\n')
  const oldLf = String(oldS).replace(/\r\n/g, '\n')
  const newLf = String(newS).replace(/\r\n/g, '\n')
  const nLf = countOccurrences(srcLf, oldLf)
  if (nLf > 1) return { ok: false, reason: 'ambiguous', count: nLf }
  if (nLf === 1) {
    const lfHit = applyOnce(srcLf, oldLf, newLf)
    const next = source.includes('\r\n') ? lfHit.replace(/\n/g, '\r\n') : lfHit
    return { ok: true, next, count: 1, fuzzy: false }
  }

  const flexCount = countFlexibleMatches(source, oldS)
  if (flexCount > 1) return { ok: false, reason: 'ambiguous', count: flexCount }
  const flex = applyFlexibleLineBlock(source, oldS, newS)
  if (flex != null) return { ok: true, next: flex, count: 1, fuzzy: true }
  return { ok: false, reason: 'none', count: 0 }
}

function countFlexibleMatches(source, oldS) {
  const src = String(source).replace(/\r\n/g, '\n')
  const oldLines = String(oldS).replace(/\r\n/g, '\n').split('\n')
  if (!oldLines.length) return 0
  const srcLines = src.split('\n')
  const oldTrim = oldLines.map((l) => l.trimEnd())
  let n = 0
  for (let i = 0; i <= srcLines.length - oldLines.length; i++) {
    let ok = true
    for (let k = 0; k < oldLines.length; k++) {
      if (srcLines[i + k].trimEnd() !== oldTrim[k]) {
        ok = false
        break
      }
    }
    if (ok) n++
  }
  return n
}

function applyDiff(source, args) {
  const r = applyDiffDetailed(source, args)
  return r.ok ? r.next : null
}

function locateWorkspaceFile(root, rel, prefs) {
  const raw = String(rel || '').replace(/^\/+/, '').replace(/\\/g, '/')
  const tries = [raw]
  const base = path.posix.basename(raw)
  const isSource = /\.(ts|tsx|js|jsx|mjs|cjs|css|html|vue|svelte)$/i.test(base)
  if (raw && isSource && !raw.startsWith('src/')) tries.push(`src/${base}`, `src/${raw}`)
  for (const candidate of tries) {
    try {
      const file = resolvePath(root, candidate, prefs)
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return { file, rel: candidate }
    } catch {
      /* try next */
    }
  }
  if (raw.includes('/')) {
    return { file: resolvePath(root, raw, prefs), rel: raw }
  }
  const dirRel = path.posix.dirname(raw)
  const dirs = [dirRel]
  if (dirRel === '.' || dirRel === '') dirs.push('src')
  for (const dir of dirs) {
    try {
      const abs = resolvePath(root, dir === '.' || !dir ? '.' : dir, prefs)
      if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) continue
      const names = fs.readdirSync(abs).filter((n) => {
        try {
          return fs.statSync(path.join(abs, n)).isFile()
        } catch {
          return false
        }
      })
      const hit = closestName(base, names)
      if (!hit) continue
      const relHit = path.posix.join(dir === '.' || !dir ? '' : dir, hit).replace(/^\/+/, '')
      const file = path.join(abs, hit)
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return { file, rel: relHit }
    } catch {
      /* try next dir */
    }
  }
  return { file: resolvePath(root, raw || '.', prefs), rel: raw }
}

function deletionBlocked(prev, next, prefs) {
  if (!prefs.fileDeletionProtection) return false
  if (prev.length > 0 && next.trim().length === 0) return true
  return false
}

async function fetchUrl(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SoumtokDesktop/1.0', Accept: 'text/html,application/json,text/plain,*/*' },
    redirect: 'follow',
  })
  const type = res.headers.get('content-type') || ''
  const body = await res.text()
  return { ok: res.ok, type, body: body.slice(0, 48_000) }
}

async function runDesktopTool(root, name, argsRaw, prefsRaw, ctx = {}) {
  const prefs = mergePrefs(prefsRaw)
  const args = parseArgs(argsRaw)
  const n = resolveToolName(String(name || '').toLowerCase())

  if (!prefs.localToolsEnabled) {
    return { ok: false, text: 'Local tools are disabled in Settings → Agents.' }
  }

  if (!root || !fs.existsSync(root)) {
    return { ok: false, text: 'Open a project folder first.' }
  }

  if (n === 'fetch') {
    if (!prefs.webFetchTool && !prefs.webSearchTool) {
      return { ok: false, text: 'Enable Web fetch or Web search in Settings → Agents → Context & tools.' }
    }
    let url = String(args.url || '').trim()
    const query = String(args.query || args.q || '').trim()
    if (!url && query) {
      if (!prefs.webSearchTool) {
        return { ok: false, text: 'Web search is off — enable it in Agents settings or pass a url to fetch.' }
      }
      url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    }
    if (!url || !/^https:\/\//i.test(url)) {
      return { ok: false, text: 'fetch needs an https:// url or a search query' }
    }
    try {
      const got = await fetchUrl(url)
      return {
        ok: got.ok,
        text: `${url}\n${got.type}\n${got.body || '(empty)'}`,
      }
    } catch (e) {
      return { ok: false, text: String(e.message || e) }
    }
  }

  if (n === 'task') {
    if (typeof ctx.runSubagent !== 'function') {
      return { ok: false, text: 'Subagent runner unavailable — restart Soumtok Desktop.' }
    }
    return ctx.runSubagent(args)
  }

  if (n === 'mcp') {
    if (!prefs.mcpConnectors) {
      return { ok: false, text: 'MCP connectors are off in Settings → Agents. Enable them to call MCP tools from desktop.' }
    }
    if (typeof ctx.callMcp !== 'function') {
      return { ok: false, text: 'MCP bridge unavailable — sign in and connect MCP in Soumtok dashboard.' }
    }
    return ctx.callMcp(args)
  }

  if (n === 'glob') {
    const pattern = String(args.pattern || args.glob || '**/*')
    return globSearch(root, pattern)
  }

  if (n === 'read_lints' || n === 'readlints') {
    return readLintsWorkspace(root, args)
  }

  if (n === 'git') {
    const action = String(args.action || args.command || 'status').toLowerCase().replace(/^git\s+/, '')
    if (action === 'commit' && prefs.terminalSandbox === 'strict') {
      return { ok: false, text: 'git commit is blocked in Ask mode. Switch to Agent.' }
    }
    if (action === 'push' || action === 'publish') {
      if (typeof ctx.api !== 'function') {
        return { ok: false, text: 'Sign in to Soumtok to push to GitHub.' }
      }
      const pub = await publishFolderToGithub({
        folder: root,
        apiFetch: ctx.api,
        name: args.name || args.repo || path.basename(root),
        isPrivate: args.private !== false && args.private !== 'false',
        message: args.message || args.m || args.commit_message,
        onOpenGrantUrl: typeof ctx.openExternal === 'function' ? ctx.openExternal : undefined,
      })
      return { ok: pub.ok, text: pub.text || (pub.ok ? 'Pushed to GitHub.' : 'Push failed.') }
    }
    return runGitTool(root, args)
  }

  if (n === 'codebase_search' || n === 'codebasesearch' || n === 'semantic_search') {
    const query = String(args.query || args.q || args.pattern || '').trim()
    return searchCodebase(root, query, args.limit)
  }

  if (n === 'read_skill' || n === 'readskill') {
    const { readSkillByNameOrCloud } = require('./agentSkills')
    return readSkillByNameOrCloud(root, args.name || args.skill || args.id, ctx)
  }

  if (n === 'browser' || n === 'browser_snapshot' || n === 'screenshot') {
    return runBrowserTool(root, args)
  }

  if (n === 'list_dir' || n === 'list') {
    const rel = String(args.path || args.dir || '.').replace(/^\/+/, '')
    let dir
    try {
      dir = resolvePath(root, rel || '.', prefs)
    } catch (e) {
      return { ok: false, text: String(e.message || e) }
    }
    let names = []
    try {
      names = fs.readdirSync(dir, { withFileTypes: true }).map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
    } catch (e) {
      return { ok: false, text: String(e.message || e) }
    }
    return { ok: true, text: names.sort().join('\n') || '(empty)' }
  }

  if (prefs.activeTaskKind === 'wipe' || prefs.wipeWorkspaceAllowed) {
    if (/^(read|grep|glob|write|diff|edit)$/i.test(n)) {
      return {
        ok: false,
        text: 'Delete/clear task — call wipe_workspace() or delete(path) only. No reads, tests, or edits until the folder is cleared.',
      }
    }
  }

  if (n === 'read') {
    const relIn = String(args.path || args.file || '').replace(/^\/+/, '')
    if (!relIn) return { ok: false, text: 'read needs path' }
    let located
    try {
      located = locateWorkspaceFile(root, relIn, prefs)
    } catch (e) {
      try {
        const file = resolveReadablePath(root, relIn, prefs)
        located = { file, rel: path.basename(relIn.replace(/\\/g, '/')) }
      } catch {
        return { ok: false, text: String(e.message || e) }
      }
    }
    const rel = located.rel
    const file = located.file
    const kind = classifyFile(rel, '')
    if (kind !== 'binary' || /\.(pdf|docx?|xlsx?|pptx?|rtf|odt|ods|odp|epub|zip)$/i.test(rel)) {
      try {
        const bytes = fs.readFileSync(file)
        const extracted = await extractFileContent(path.basename(rel), mimeFromExt(path.extname(rel).slice(1)), bytes)
        if (extracted.text) {
          const note = extracted.truncated ? '\n…truncated' : ''
          return {
            ok: true,
            text: `${rel} (${String(extracted.kind || kind).toUpperCase()}, ${extracted.text.length} chars)${note}\n${extracted.text.slice(0, 48_000)}`,
            rel,
            path: file,
          }
        }
        if (extracted.hint) {
          return { ok: true, text: `${rel}: ${extracted.hint}`, rel, path: file }
        }
        if (kind !== 'text') {
          return {
            ok: true,
            text: `${rel} (${bytes.length} bytes) — no extractable text.${extracted.error ? ` ${extracted.error}` : ''}`,
            rel,
            path: file,
          }
        }
      } catch (e) {
        if (kind !== 'text') return { ok: false, text: `Could not read ${rel}: ${String(e.message || e)}` }
      }
    }
    try {
      const body = fs.readFileSync(file, 'utf8')
      const all = body.split('\n')
      const total = all.length
      const from = Math.max(1, Number(args.start_line ?? args.startLine) || 1)
      const to = Math.min(total, Number(args.end_line ?? args.endLine) || total)
      const ranged = from > 1 || to < total
      const slice = ranged ? all.slice(from - 1, to).join('\n') : body
      const head = ranged ? `${rel} (${total} lines) [lines ${from}-${to}]` : `${rel} (${total} lines)`
      return { ok: true, text: `${head}\n${slice.slice(0, 48_000)}`, rel, path: file }
    } catch (e) {
      const base = path.basename(relIn)
      const srcHint = /\.(ts|tsx|js|jsx|mjs|cjs|css|html|vue|svelte)$/i.test(base)
        ? ` Try src/${base}.`
        : ''
      return { ok: false, text: `${relIn} not found.${srcHint}` }
    }
  }

  if (n === 'grep') {
    const pattern = String(args.pattern || args.query || '')
    if (!pattern) return { ok: false, text: 'grep needs pattern' }
    const globHint = String(args.glob || args.path || '')
    const fast = grepRipgrep(root, pattern, globHint)
    if (fast) return fast
    return grepWalk(root, pattern, globHint)
  }

  if (n === 'wipe_workspace' || n === 'clear_workspace') {
    if (prefs.fileDeletionProtection && !prefs.wipeWorkspaceAllowed) {
      return {
        ok: false,
        text: 'Workspace wipe blocked — set Run mode to Run everything or ask again with "delete everything in this project".',
      }
    }
    const keepGit = args.keep_git !== false && args.keepGit !== false && String(args.keep_git || 'true') !== 'false'
    let removed = 0
    const skipped = []
    try {
      for (const name of fs.readdirSync(root)) {
        if (keepGit && name === '.git') {
          skipped.push('.git')
          continue
        }
        fs.rmSync(path.join(root, name), { recursive: true, force: true })
        removed++
      }
    } catch (e) {
      return { ok: false, text: String(e.message || e) }
    }
    return {
      ok: true,
      text: `Wiped workspace root: removed ${removed} item(s)${skipped.length ? ` (kept ${skipped.join(', ')})` : ''}. list_dir(".") to confirm.`,
      rel: '.',
    }
  }

  if (n === 'delete') {
    const rel = String(args.path || args.file || '').replace(/^\/+/, '')
    if (!rel) return { ok: false, text: 'delete needs path' }
    if (prefs.fileDeletionProtection && !prefs.wipeWorkspaceAllowed) {
      return {
        ok: false,
        text: 'File deletion blocked — Settings → Agents → Run mode "Run everything", or disable File-deletion protection.',
      }
    }
    let file
    try {
      file = resolvePath(root, rel, prefs)
    } catch (e) {
      return { ok: false, text: String(e.message || e) }
    }
    try {
      const st = fs.statSync(file)
      if (st.isDirectory()) {
        fs.rmSync(file, { recursive: true, force: true })
      } else {
        fs.unlinkSync(file)
      }
      invalidateIndex(root)
      return { ok: true, text: `Deleted ${rel}`, rel }
    } catch (e) {
      return { ok: false, text: String(e.message || e) }
    }
  }

  if (n === 'write') {
    const editArgs = normalizeWorkspaceEditArgs(args)
    const rel = String(editArgs.path || editArgs.file || '').replace(/^\/+/, '')
    const content = String(editArgs.content ?? editArgs.body ?? '')
    if (!rel) return { ok: false, text: 'write needs path' }
    if (/^<write\s/i.test(rel) || /<\/write>$/i.test(rel)) {
      return { ok: false, text: 'write path looks like XML markup — use the write tool with a real filename.' }
    }
    let file
    let storedRel = rel
    try {
      const located = resolveWritePath(root, rel, prefs)
      file = located.file
      storedRel = located.rel
    } catch (e) {
      return { ok: false, text: String(e.message || e) }
    }
    let prev = ''
    try {
      prev = fs.readFileSync(file, 'utf8')
    } catch {
      prev = ''
    }
    if (deletionBlocked(prev, content, prefs)) {
      return { ok: false, text: 'File deletion blocked by Settings → Agents → File-deletion protection.' }
    }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content, 'utf8')
    invalidateIndex(root)
    const out = editToolResult(storedRel, prev, content)
    return { ...out, path: file }
  }

  if (n === 'diff' || n === 'edit' || n === 'str_replace' || n === 'apply_patch') {
    const editArgs = normalizeWorkspaceEditArgs(args)
    const relIn = String(editArgs.path || editArgs.file || '').replace(/^\/+/, '')
    if (!relIn) return { ok: false, text: 'diff needs path' }
    let located
    try {
      located = locateWorkspaceFile(root, relIn, prefs)
    } catch (e) {
      return { ok: false, text: String(e.message || e) }
    }
    const rel = located.rel
    const file = located.file
    let prev = ''
    try {
      prev = fs.readFileSync(file, 'utf8')
    } catch {
      prev = ''
    }
    if (!prev && !editArgs.content && !editArgs.body) {
      return {
        ok: false,
        text: `Could not apply edit to ${relIn} — file missing. read() the real path (often src/${path.basename(relIn)}) then write() or diff().`,
      }
    }
    const detailed = applyDiffDetailed(prev, editArgs)
    if (!detailed.ok) {
      const nearest = nearestMatchHint(prev, editArgs.old_string || editArgs.search || editArgs.find || '')
      if (detailed.reason === 'ambiguous') {
        return {
          ok: false,
          text:
            `Could not apply edit to ${rel}: old_string matched ${detailed.count} times — include more surrounding lines so it is unique.\n` +
            (nearest ? `${nearest}\n` : ''),
        }
      }
      return {
        ok: false,
        text:
          `Could not apply edit to ${rel}: old_string not found in the file. ` +
          `read("${rel}", start_line, end_line) and copy EXACT text into old_string, or write() the full file.\n` +
          (nearest ? `${nearest}\n` : `File starts: ${prev.slice(0, 280).replace(/\s+/g, ' ')}`),
      }
    }
    const next = detailed.next
    if (detailed.fuzzy) {
      /* unique trimEnd line-block match — still a real edit */
    }
    if (deletionBlocked(prev, next, prefs)) {
      return { ok: false, text: 'File deletion blocked by Settings → Agents → File-deletion protection.' }
    }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, next, 'utf8')
    invalidateIndex(root)
    const out = editToolResult(rel, prev, next)
    return { ...out, path: file }
  }

  if (n === 'read_terminal' || n === 'terminal_log' || n === 'terminal_logs') {
    const waitMs = Math.min(Number(args.wait_ms ?? args.waitMs) || 0, 45_000)
    const tail = Math.min(Number(args.tail) || 16_000, 48_000)
    if (waitMs > 0) await waitForLogGrowth(root, { waitMs, minChars: 20 })
    const log = readLogsForCwd(root, tail)
    if (!log.trim()) {
      return {
        ok: true,
        text: '(No terminal output captured yet. Run terminal(command) first or open the Terminal panel — Soumtok records integrated shell output for the agent.)',
      }
    }
    return { ok: true, text: log }
  }

  if (n === 'terminal') {
    const rawCmd = String(args.command || args.cmd || '').trim().slice(0, 2000)
    if (!rawCmd) return { ok: false, text: 'terminal needs command' }
    const asRead = parseFileReadViaShell(rawCmd)
    if (asRead?.path) {
      const got = await runDesktopTool(
        root,
        'read',
        { path: asRead.path, start_line: asRead.startLine, end_line: asRead.endLine },
        prefs,
        ctx,
      )
      if (!got.ok) return got
      return {
        ok: true,
        text: `${got.text}\n(Use read({ path, start_line, end_line }) for source files — not sed/Get-Content/type.)`,
        rel: got.rel,
        path: got.path,
      }
    }
    const normalized = normalizeTerminalCommand(rawCmd, root)
    if (!normalized.ok) return normalized
    const command = normalized.cmd
    let cwd = root
    const cwdHint = args.cwd || args.workdir || normalized.cwdRel || ''
    if (cwdHint) {
      try {
        const dir = resolvePath(root, String(cwdHint).replace(/^\/+/, ''), prefs)
        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) cwd = dir
      } catch {
        /* stay at workspace root */
      }
    }
    const timeoutMs = Math.min(Math.max(Number(args.timeout || args.timeout_ms) || 180_000, 1_000), 300_000)
    const sandbox = prefs.terminalSandbox || 'permissive'
    const allowed = allowTerminal(command, sandbox)
    if (!allowed) {
      return {
        ok: false,
        text: `Command blocked (${sandbox} policy): ${command.slice(0, 120)}. If Run mode is already "Run everything", restart Soumtok Desktop and retry. Pipes like netstat | findstr are allowed in permissive mode.`,
      }
    }

    if (prefs.wipeWorkspaceAllowed || prefs.activeTaskKind === 'wipe') {
      if (/^node\s+-e\b/i.test(allowed) || /^npm\s+(test|run\s+test)\b/i.test(allowed)) {
        return {
          ok: false,
          text: 'User asked to DELETE/CLEAR this project — call wipe_workspace() or delete(path). Do not run tests or node -e.',
        }
      }
    }

    if (isLongRunningTerminalCommand(allowed) && integratedTerminalLikelyHasDevServer(root)) {
      const log = readLogsForCwd(root, 6000)
      const urls = log.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+[^\s]*/gi)?.slice(-3).join('\n') || ''
      return {
        ok: true,
        text:
          `Skipped starting another dev server — integrated Terminal already shows a localhost URL (keep using that session).\n` +
          (urls ? `Likely URLs:\n${urls}\n` : '') +
          `Use read_terminal({ wait_ms: 3000 }) or web_fetch on that URL. Only run terminal("${allowed}") again if read_terminal shows the server died.`,
      }
    }

    if (/^git\s+push\b/i.test(allowed) && typeof ctx.api === 'function') {
      const pub = await publishFolderToGithub({
        folder: cwd,
        apiFetch: ctx.api,
        name: path.basename(cwd),
        message: 'Update from Soumtok',
        onOpenGrantUrl: typeof ctx.openExternal === 'function' ? ctx.openExternal : undefined,
      })
      if (typeof ctx.onTerminalMirror === 'function') {
        ctx.onTerminalMirror({ cwd, command: allowed, output: pub.text || '' })
      }
      return { ok: pub.ok, text: pub.text || (pub.ok ? 'Pushed to GitHub.' : 'git push failed.') }
    }

    const integrated = await runViaIntegratedTerminal(ctx, root, allowed, normalized, cwd)
    if (integrated) return integrated
    if (process.platform === 'win32' && isLongRunningTerminalCommand(allowed)) {
      return {
        ok: false,
        text:
          'Need the bottom Terminal panel for this long-running command. Soumtok will open it — retry terminal() once. Do not ask the user to press Ctrl+J.',
      }
    }
    const result = spawnSync(allowed, {
      shell: true,
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    })
    const out = `${result.stdout || ''}${result.stderr || ''}`.slice(0, 16_000) || '(no output)'
    if (typeof ctx.onTerminalMirror === 'function') {
      ctx.onTerminalMirror({ cwd, command: allowed, output: out })
    }
    return { ok: result.status === 0, text: out }
  }

  if (n === 'github') {
    const action = String(args.action || 'clone').toLowerCase()
    if (action === 'publish' || action === 'push') {
      if (typeof ctx.api !== 'function') {
        return { ok: false, text: 'Sign in to Soumtok to publish to GitHub.' }
      }
      const pub = await publishFolderToGithub({
        folder: root,
        apiFetch: ctx.api,
        name: args.name || args.repo || path.basename(root),
        isPrivate: args.private !== false && args.private !== 'false',
        message: args.message || args.commit || args.commit_message,
        onOpenGrantUrl: typeof ctx.openExternal === 'function' ? ctx.openExternal : undefined,
      })
      return { ok: pub.ok, text: pub.text || (pub.ok ? 'Published to GitHub.' : 'Publish failed.') }
    }
    if (action !== 'clone') {
      return { ok: false, text: 'github supports action=clone, publish, or push.' }
    }
    const repo = String(args.repo || args.url || '').trim()
    if (!repo) return { ok: false, text: 'github clone needs repo (owner/name or https URL).' }
    const url = /^https?:\/\//i.test(repo)
      ? repo
      : `https://github.com/${repo.replace(/^github\.com\//i, '').replace(/\.git$/i, '')}.git`
    let names = []
    try {
      names = fs.readdirSync(root).filter((e) => e !== '.git' && e !== '.soumtok')
    } catch {
      names = []
    }
    const dest = names.length ? path.basename(url.replace(/\.git$/i, '')) : '.'
    const ran = spawnSync('git', ['clone', '--depth', '1', url, dest], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 180_000,
    })
    const text = `${ran.stdout || ''}${ran.stderr || ''}`.trim() || `cloned ${url}`
    if (ran.error) return { ok: false, text: ran.error.message || String(ran.error) }
    return { ok: ran.status === 0, text }
  }

  if (n === 'generate_image' || n === 'generateimage') {
    const prompt = String(args.prompt || args.text || args.description || '').trim()
    if (!prompt) return { ok: false, text: 'generate_image needs a prompt' }
    if (/^(make|generate|create)\s+(a\s+)?(video|song|music|audio)\b/i.test(prompt)) {
      return { ok: false, text: 'Still images only — Soumtok does not generate video or music.' }
    }
    if (typeof ctx.generateImage !== 'function') {
      return { ok: false, text: 'Sign in to Soumtok to generate images (Flux 2 Max via REPLICATE_API_TOKEN).' }
    }
    const parsed = parseStillRequest(prompt)
    const pathHint = String(args.path || args.file || '').replace(/^\/+/, '')
    const aspect = normalizeStillAspect(
      args.aspect ||
        args.aspect_ratio ||
        args.ratio ||
        (parsed.aspect !== DEFAULT_STILL_ASPECT ? parsed.aspect : stillAspectForImageUse(parsed.prompt, pathHint)),
    )
    const clean = parsed.prompt
    const got = await ctx.generateImage({ prompt: clean, model: args.model, aspect })
    if (!got?.ok) return { ok: false, text: got?.error || 'Image generation failed' }
    const ext = String(got.ext || 'jpg').replace(/^\./, '')
    let rel = String(args.path || args.file || '').replace(/^\/+/, '')
    if (!rel) rel = slugImageName(clean, ext)
    else if (!/\.(png|jpe?g|webp)$/i.test(rel)) rel = `${rel.replace(/\/+$/, '')}.${ext}`
    try {
      const buf = Buffer.from(String(got.base64 || ''), 'base64')
      if (!buf.length) return { ok: false, text: 'Image API returned no bytes' }
      const saved = writeBinaryFile(root, rel, buf, prefs)
      const dataUrl = `data:${got.contentType || mimeFromExt(ext) || 'image/jpeg'};base64,${got.base64}`
      const ratio = got.aspect || aspect
      return {
        ok: true,
        text: `Saved still image to ${saved.rel} (${ratio}, ${buf.length} bytes, ${got.model || 'flux'}). Use examine_media({ path: "${saved.rel}" }) if you need a description.`,
        rel: saved.rel,
        path: saved.file,
        aspect: ratio,
        image: { dataUrl },
      }
    } catch (e) {
      return { ok: false, text: String(e.message || e) }
    }
  }

  if (n === 'examine_media' || n === 'examinemedia' || n === 'examine_image') {
    const rel = String(args.path || args.file || '').replace(/^\/+/, '')
    if (!rel) return { ok: false, text: 'examine_media needs path' }
    let file
    try {
      file = resolveReadablePath(root, rel, prefs)
    } catch (e) {
      return { ok: false, text: String(e.message || e) }
    }
    if (!fs.existsSync(file)) {
      try {
        file = locateWorkspaceFile(root, rel, prefs).file
      } catch {
        try {
          file = resolveReadablePath(root, path.basename(rel), prefs)
        } catch {
          return { ok: false, text: `Not found: ${rel}` }
        }
      }
    }
    const ext = path.extname(file).slice(1)
    const fileKind = classifyFile(path.basename(file), mimeFromExt(ext))
    if (fileKind !== 'image' && fileKind !== 'video') {
      try {
        const bytes = fs.readFileSync(file)
        const extracted = await extractFileContent(path.basename(file), mimeFromExt(ext), bytes)
        if (extracted.text) {
          const note = extracted.truncated ? '\n…truncated' : ''
          return {
            ok: true,
            text: `${rel} (${String(extracted.kind || fileKind).toUpperCase()}, ${extracted.text.length} chars)${note}\n${extracted.text.slice(0, 48_000)}`,
            rel,
          }
        }
        if (extracted.hint) {
          return { ok: true, text: `${rel}: ${extracted.hint}`, rel }
        }
      } catch (e) {
        return { ok: false, text: `Could not read ${rel}: ${String(e.message || e)}` }
      }
    }
    const mime = mimeFromExt(ext)
    if (!mime) {
      return {
        ok: false,
        text: 'examine_media supports images (png/jpg/webp/gif) and videos (mp4/webm/mov). For PDF/DOCX use read() or the ATTACHED DOCUMENTS block.',
      }
    }
    const buf = fs.readFileSync(file)
    if (buf.length > 12 * 1024 * 1024) return { ok: false, text: 'File is larger than 12 MB — pick a smaller clip or screenshot.' }
    const base64 = buf.toString('base64')
    const dataUrl = mime.startsWith('image/') ? `data:${mime};base64,${base64}` : ''
    if (typeof ctx.examineMedia !== 'function') {
      return {
        ok: true,
        text: `${rel} (${mime}, ${buf.length} bytes). Vision API unavailable — open the file in the editor. Sign in so examine_media can describe it.`,
        rel,
        image: dataUrl ? { dataUrl } : undefined,
      }
    }
    const got = await ctx.examineMedia({ mime, base64, prompt: args.prompt || args.question })
    if (!got?.ok) return { ok: false, text: got?.error || 'Could not examine media', rel, image: dataUrl ? { dataUrl } : undefined }
    return {
      ok: true,
      text: `${rel} (${mime})\nModel: ${got.model || 'vision'}\n\n${got.analysis || ''}`.slice(0, 12_000),
      rel,
      image: dataUrl ? { dataUrl } : undefined,
    }
  }

  return { ok: false, text: `Unknown tool: ${name}` }
}

function parseGrepOutput(text, root) {
  if (!text || text === 'No matches.') return []
  const matches = []
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue
    const m = line.match(/:(\d+):\s?(.*)$/)
    if (!m) continue
    const filePart = line.slice(0, m.index)
    if (!filePart) continue
    const rel = filePart.replace(/\\/g, '/')
    const abs = path.isAbsolute(filePart) ? filePart : path.join(root, filePart)
    matches.push({
      rel,
      path: abs,
      line: Number(m[1]),
      text: m[2].trim(),
    })
  }
  return matches
}

function workspaceGrep(root, pattern, opts = {}) {
  if (!root || !pattern) return { ok: false, matches: [], error: 'Missing search pattern.' }
  const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 500)
  const fast = grepRipgrep(root, pattern, opts.glob || '', limit)
  if (fast?.ok) return { ok: true, matches: parseGrepOutput(fast.text, root) }
  const slow = grepWalk(root, pattern, opts.glob || '', limit)
  if (!slow.ok) return { ok: false, matches: [], error: slow.text }
  return { ok: true, matches: parseGrepOutput(slow.text, root) }
}

function workspaceReplaceAll(root, pattern, replacement, opts = {}) {
  const grep = workspaceGrep(root, pattern, { limit: opts.limit || 500 })
  if (!grep.ok) return { ok: false, error: grep.error || 'Search failed.' }
  const files = [...new Set(grep.matches.map((m) => m.path))]
  if (!files.length) return { ok: true, files: 0, replacements: 0 }
  let re
  try {
    re = new RegExp(pattern, opts.caseSensitive ? 'g' : 'gi')
  } catch {
    return { ok: false, error: `Invalid pattern: ${pattern}` }
  }
  let fileCount = 0
  let replacements = 0
  for (const file of files) {
    let text
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    let next = text
    let n = 0
    next = text.replace(re, () => {
      n += 1
      return replacement
    })
    if (n > 0) {
      fs.writeFileSync(file, next, 'utf8')
      fileCount += 1
      replacements += n
    }
  }
  return { ok: true, files: fileCount, replacements, paths: files.filter((f) => grep.matches.some((m) => m.path === f)) }
}

module.exports = {
  runDesktopTool,
  normalizeTerminalCommand,
  unwrapExternalWindowsTerminal,
  isLongRunningTerminalCommand,
  applyDiff,
  applyDiffDetailed,
  locateWorkspaceFile,
  parseFileReadViaShell,
  commandBlockedPermissive,
  saveMcpArtifacts,
  workspaceGrep,
  workspaceReplaceAll,
}
