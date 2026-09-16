/**
 * Bottom-panel terminal (xterm.js) — VS Code / Cursor style, real shell via main process PTY or pipe fallback.
 */
;(function () {
  const { Terminal, FitAddon: FitAddonExport } = window.xterm || {}
  const FitAddon = typeof FitAddonExport === 'function' ? FitAddonExport : null

  if (!Terminal) {
    console.warn('xterm not loaded — check @xterm scripts in index.html')
    window.SoumtokTerminal = {
      setProjectCwd() {},
      newTerminal: async () => {},
      killActive() {},
      killAll() {},
      fitAll() {},
      toggleSplit() {},
      hasSessions: () => false,
      ensureOne: async () => {
        const hosts = $('term-hosts')
        if (hosts && !hosts.dataset.xtermMissing) {
          hosts.dataset.xtermMissing = '1'
          hosts.innerHTML =
            '<p class="term-connect-error">Terminal UI did not load. In <code>desktop/</code> run <code>npm install</code> and restart Soumtok.</p>'
        }
      },
    }
    return
  }

  const XTERM_THEME = {
    dark: {
      background: '#1e1e1e',
      foreground: '#cccccc',
      cursor: '#aeafad',
      selectionBackground: '#264f78',
    },
    light: {
      background: '#ffffff',
      foreground: '#1e1e1e',
      cursor: '#1e1e1e',
      selectionBackground: '#add6ff',
    },
  }

  /** @type {{ id: string, title: string, shell: string, term: import('@xterm/xterm').Terminal, fit: import('@xterm/addon-fit').FitAddon, host: HTMLElement, pane: number }[]} */
  let sessions = []
  let activeId = null
  let ipcBound = false
  let cwdHint = null
  let shellProfile = 'powershell'
  let splitMode = false
  let shellMenuOpen = false
  /** @type {Map<string, string>} */
  const outputBuffer = new Map()
  /** @type {Promise<void> | null} */
  let createSessionLock = null
  /** @type {{ profile?: string, cwd?: string, log?: string }[]} */
  let pendingRestoreLogs = []

  function api() {
    return window.soumtok
  }

  function $(id) {
    return document.getElementById(id)
  }

  function themeKey() {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  }

  function applyTermTheme(term) {
    term.options.theme = XTERM_THEME[themeKey()]
  }

  function activeSession() {
    return sessions.find((s) => s.id === activeId) || sessions[0] || null
  }

  function sessionLabel(s) {
    const base = s.shell || 'terminal'
    const where = s.cwd ? folderShort(s.cwd) : ''
    const tag = where ? `${base} (${where})` : base
    const n = sessions.filter((x) => x.shell === s.shell).indexOf(s) + 1
    if (sessions.filter((x) => x.shell === s.shell).length <= 1) return tag
    return `${tag} #${n}`
  }

  function folderShort(dir) {
    if (!dir) return ''
    const parts = dir.replace(/\\/g, '/').split('/').filter(Boolean)
    return parts[parts.length - 1] || dir
  }

  function setConnectionWarn(show, title) {
    const warn = $('term-conn-warn')
    if (!warn) return
    warn.hidden = !show
    if (title) warn.title = title
  }

  function formatToolbarCwd(dir) {
    if (!dir) return ''
    const norm = dir.replace(/\//g, '\\')
    if (norm.length <= 56) return norm
    return `…${norm.slice(-54)}`
  }

  function renderShellLabel() {
    const label = $('term-shell-label')
    const s = activeSession()
    const nameEl = label?.querySelector('.term-shell-name')
    const shell = s?.shell || shellProfile || 'powershell'
    const where = s?.cwd || cwdHint
    const text = where ? `${shell} — ${formatToolbarCwd(where)}` : shell
    if (nameEl) nameEl.textContent = text
    else if (label) label.textContent = text
    if (label && where) label.title = `${shell} · ${where}`
    if (label) label.toggleAttribute('disabled', !s)
    if (s?.connected === false) {
      setConnectionWarn(true, 'Shell disconnected — click + for a new terminal')
    } else if (s) {
      setConnectionWarn(false)
    }
    syncToolbar()
  }

  function syncToolbar() {
    const has = sessions.length > 0
    $('term-kill')?.toggleAttribute('disabled', !has)
    if (has) {
      $('term-kill')?.setAttribute('title', 'Kill Terminal')
    } else {
      $('term-kill')?.setAttribute('title', 'Kill Terminal (no session)')
    }
  }

  function newTermId() {
    const bytes = new Uint8Array(6)
    crypto.getRandomValues(bytes)
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  function flushOutput(id, term) {
    const pending = outputBuffer.get(id)
    if (pending) {
      term.write(pending)
      outputBuffer.delete(id)
    }
  }

  function cdCommand(dir, shell) {
    if (!dir) return null
    if (shell === 'cmd') return `cd /d "${dir.replace(/"/g, '""')}"\r\n`
    return `Set-Location -LiteralPath '${dir.replace(/'/g, "''")}'\r\n`
  }

  function agentCommandLooksLongRunning(line) {
    const c = String(line || '').trim()
    if (/^(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|serve|preview|watch)\b/i.test(c)) return true
    if (/^(npm|pnpm|yarn|bun)\s+run\s+\S+/i.test(c)) return true
    if (/^(npm|pnpm|yarn|bun)\s+start\b/i.test(c)) return true
    if (/^node\s+(server|index|app|main)\.(js|cjs|mjs)\b/i.test(c)) return true
    if (/^node\s+\S+\.(mjs|js|cjs)\b/i.test(c) && !/\b(-e|--eval|test)\b/i.test(c)) return true
    return false
  }

  /** PTY stdin only — no ANSI (PowerShell parses bare `[90m` as syntax and fails). */
  function agentShellInputOnly(line, shell) {
    const cmd = String(line || '').trim()
    if (!cmd) return ''
    const sh = String(shell || '').toLowerCase()
    // PowerShell PTY must receive PowerShell. Wrapping in cmd /d /s /c breaks
    // `cd /d PATH; npx …` (cmd treats `;` as part of the path → "cannot find the path").
    if (sh === 'cmd') {
      return `${cmd}\r\n`
    }
    return `${toPowerShellLine(cmd)}\r\n`
  }

  /** Map a model-issued shell line onto PowerShell when the live PTY is pwsh. */
  function toPowerShellLine(cmd) {
    let line = String(cmd || '').trim()
    if (!line) return ''
    line = line.replace(/\s*&&\s*/g, '; ')
    line = line.replace(/^cd\s+\/d\s+/i, 'Set-Location ')
    return line
  }

  function showAgentCommandInTerm(term, line) {
    if (!term || !line) return
    term.writeln('')
    term.writeln('\x1b[90m# soumtok agent\x1b[0m')
    term.writeln(`\x1b[36m${line}\x1b[0m`)
  }

  /** Paint capture in xterm only — never type `[soumtok capture]` into the live shell. */
  function appendDisplay(text) {
    const session = activeSession()
    if (!session?.term) return
    const body = String(text || '').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n').trimEnd()
    if (!body) return
    session.term.writeln('')
    session.term.writeln('\x1b[90m# command output\x1b[0m')
    for (const row of body.split('\r\n')) session.term.writeln(row)
    session.term.scrollToBottom?.()
  }

  async function restartSessionInPlace(session) {
    if (!session?.id || !session.term) return createSession({})
    session._resetLineBuffer?.()
    session.term.writeln('\r\n\x1b[90mRestarting shell (same tab)…\x1b[0m')
    try {
      await api().termKill(session.id)
    } catch {
      /* ignore */
    }
    const cols = Math.max(session.term.cols || 80, 20)
    const rows = Math.max(session.term.rows || 24, 8)
    let meta
    try {
      meta = await api().termCreate({
        id: session.id,
        cwd: cwdHint || session.cwd || undefined,
        cols,
        rows,
        profile: session.shell || shellProfile,
      })
    } catch (err) {
      session.connected = false
      session.term.writeln(`\x1b[31mRestart failed: ${String(err?.message || err)}\x1b[0m`)
      return null
    }
    session.shell = meta.shell || session.shell
    session.cwd = meta.cwd || session.cwd || cwdHint
    session.connected = meta.connected !== false
    session.nativePty = Boolean(meta.pty)
    session.pipeMode = Boolean(meta.pipe) && !session.nativePty
    if (session.cwd) void api().termBindCwd?.({ id: session.id, cwd: session.cwd })
    session._flushInput?.()
    flushOutput(session.id, session.term)
    renderShellLabel()
    return session
  }

  function waitForPanelLayout() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve(undefined))
      })
    })
  }

  function renderTabsRail() {
    const rail = $('term-tabs-rail')
    if (!rail) return
    rail.innerHTML = ''
    rail.hidden = sessions.length <= 1
  }

  function closeShellMenu() {
    shellMenuOpen = false
    $('term-shell-menu')?.setAttribute('hidden', '')
  }

  function openShellMenu() {
    const menu = $('term-shell-menu')
    const anchor = $('term-shell-label')
    if (!menu || !anchor) return
    shellMenuOpen = true
    menu.removeAttribute('hidden')
    const rect = anchor.getBoundingClientRect()
    menu.style.left = `${Math.max(8, rect.right - 220)}px`
    menu.style.top = `${rect.bottom + 4}px`

    const isWin = /Win/i.test(navigator.userAgent)
    const profiles = isWin
      ? [
          { id: 'powershell', label: 'PowerShell' },
          { id: 'cmd', label: 'Command Prompt' },
        ]
      : [{ id: 'bash', label: 'Default shell' }]

    let html = '<div class="term-shell-menu-head">Open terminal</div>'
    for (const p of profiles) {
      html += `<button type="button" class="term-shell-menu-item" data-profile="${p.id}">${p.label}</button>`
    }
    html += '<div class="term-shell-menu-divider"></div>'
    for (const s of sessions) {
      html += `<button type="button" class="term-shell-menu-item${s.id === activeId ? ' on' : ''}" data-focus="${s.id}">${sessionLabel(s)}</button>`
    }
    menu.innerHTML = html
    menu.querySelectorAll('[data-profile]').forEach((btn) => {
      btn.onclick = () => {
        shellProfile = btn.dataset.profile || 'powershell'
        closeShellMenu()
        void createSession({ profile: shellProfile })
      }
    })
    menu.querySelectorAll('[data-focus]').forEach((btn) => {
      btn.onclick = () => {
        focusSession(btn.dataset.focus)
        closeShellMenu()
      }
    })
  }

  function termAreaSize() {
    const hosts = $('term-hosts')
    const view = $('view-terminal')
    const w = Math.max(hosts?.clientWidth || view?.clientWidth || 0, 320)
    const h = Math.max(hosts?.clientHeight || view?.clientHeight || 0, 120)
    return { w, h }
  }

  function proposeTermGrid(session) {
    const { w, h } = termAreaSize()
    if (session?.fit) {
      try {
        session.fit.fit()
      } catch {
        /* ignore */
      }
    }
    let cols = session.term.cols || 0
    let rows = session.term.rows || 0
    if (cols < 20 || rows < 8) {
      cols = Math.max(20, Math.floor(w / 9))
      rows = Math.max(8, Math.floor(h / 18))
      session.term.resize(cols, rows)
    }
    return { cols, rows }
  }

  function syncResize(session) {
    if (!session) return
    const { h } = termAreaSize()
    if (h < 40) return
    session.host.style.height = '100%'
    session.host.style.width = '100%'
    const { cols, rows } = proposeTermGrid(session)
    session.term.refresh(0, Math.max(0, session.term.rows - 1))
    if (cols > 0 && rows > 0) {
      api().termResize?.({ id: session.id, cols, rows })
    }
  }

  function normTermPath(p) {
    return String(p || '')
      .replace(/\//g, '\\')
      .replace(/\\+$/, '')
      .toLowerCase()
  }

  function bindTermInput(session, id) {
    const pending = []
    let lineBuffer = ''
    const forward = (data) => {
      const sid = session.id || id
      if (session.connected === false) pending.push(data)
      else void api().termWrite?.({ id: sid, data })
    }
    const forwardPipeKeys = (data) => {
      for (let i = 0; i < data.length; i++) {
        const ch = data[i]
        if (ch === '\r') {
          forward(lineBuffer + '\r\n')
          lineBuffer = ''
          continue
        }
        if (ch === '\n') {
          if (i === 0 || data[i - 1] !== '\r') {
            forward(lineBuffer + '\r\n')
            lineBuffer = ''
          }
          continue
        }
        if (ch === '\u007f' || ch === '\b') {
          lineBuffer = lineBuffer.slice(0, -1)
          continue
        }
        if (ch === '\u0003') {
          forward('\x03')
          lineBuffer = ''
          continue
        }
        lineBuffer += ch
      }
    }
    session.term.onData((data) => {
      if (session.pipeMode) forwardPipeKeys(data)
      else forward(data)
    })
    session._flushInput = () => {
      while (pending.length) forward(pending.shift())
    }
    session._resetLineBuffer = () => {
      lineBuffer = ''
    }
  }

  function focusActiveTerm() {
    const s = activeSession()
    if (!s) return
    try {
      s.term.focus()
    } catch {
      /* ignore */
    }
  }

  function watchPanelResize() {
    const body = $('panel-body')
    const hosts = $('term-hosts')
    if (typeof ResizeObserver === 'undefined') return
    const onResize = () => {
      for (const s of sessions) {
        if (s.id === activeId) syncResize(s)
      }
    }
    if (body && !body.dataset.termResizeWatch) {
      body.dataset.termResizeWatch = '1'
      new ResizeObserver(onResize).observe(body)
    }
    if (hosts && !hosts.dataset.termResizeWatch) {
      hosts.dataset.termResizeWatch = '1'
      new ResizeObserver(onResize).observe(hosts)
    }
  }

  function showSessionHost(id) {
    for (const s of sessions) {
      s.host.hidden = s.id !== id
    }
    activeId = id
    renderShellLabel()
    renderTabsRail()
    const s = activeSession()
    if (s) {
      requestAnimationFrame(() => {
        syncResize(s)
        s.term.focus()
      })
    }
  }

  function bindIpcOnce() {
    if (ipcBound) return
    ipcBound = true
    api().onTerm((msg) => {
      const id = typeof msg === 'string' ? activeId : msg?.id
      const data = typeof msg === 'string' ? msg : msg?.data
      if (!data) return
      let s = id ? sessions.find((x) => x.id === id) : null
      if (!s) s = activeSession()
      if (s) {
        s.log = ((s.log || '') + data).slice(-160000)
        s.term.write(data)
      } else if (id) outputBuffer.set(id, (outputBuffer.get(id) || '') + data)
    })
    api().onTermExit?.((msg) => {
      const s = sessions.find((x) => x.id === msg?.id)
      if (s) {
        s.connected = false
        s.term.writeln(`\r\n\x1b[90m[Process exited${msg.code != null ? ` ${msg.code}` : ''}]\x1b[0m`)
        renderShellLabel()
      }
    })
    document.addEventListener('click', (ev) => {
      if (!shellMenuOpen) return
      const menu = $('term-shell-menu')
      const pick = $('term-shell-label')
      if (menu?.contains(ev.target) || pick?.contains(ev.target)) return
      closeShellMenu()
    })
    try {
      const mo = new MutationObserver(() => {
        for (const s of sessions) applyTermTheme(s.term)
      })
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    } catch {
      /* ignore */
    }
  }

  async function createSession(opts = {}) {
    while (createSessionLock) await createSessionLock
    let releaseLock
    createSessionLock = new Promise((resolve) => {
      releaseLock = resolve
    })
    try {
      return await createSessionInner(opts)
    } finally {
      releaseLock?.()
      createSessionLock = null
    }
  }

  async function createSessionInner(opts = {}) {
    bindIpcOnce()
    watchPanelResize()
    const hosts = $('term-hosts')
    if (!hosts) return null

    await waitForPanelLayout()

    const id = opts.attach?.id || newTermId()
    const host = document.createElement('div')
    host.className = 'term-xterm-host'
    hosts.appendChild(host)

    const term = new Terminal({
      cursorBlink: true,
      disableStdin: false,
      fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      scrollback: 5000,
      allowProposedApi: true,
      theme: XTERM_THEME[themeKey()],
    })
    let fit = null
    if (FitAddon) {
      fit = new FitAddon()
      term.loadAddon(fit)
    }
    term.open(host)
    host.tabIndex = 0
    host.addEventListener('pointerdown', () => {
      term.focus()
    })
    if (!host.querySelector('.xterm')) {
      host.innerHTML =
        '<p class="term-connect-error">Terminal UI failed to attach. Quit Soumtok fully and run <code>npm start</code> in <code>desktop/</code> again.</p>'
      return null
    }
    term.resize(80, 24)
    term.refresh(0, term.rows - 1)

    try {
      fit?.fit?.()
    } catch {
      /* panel may still be laying out */
    }
    proposeTermGrid({ term, fit, host })
    syncToolbar()

    const cols = Math.max(term.cols || 80, 20)
    const rows = Math.max(term.rows || 24, 8)
    const profile = opts.profile || opts.attach?.shell || shellProfile

    const session = {
      id,
      title: profile,
      shell: profile,
      cwd: cwdHint,
      term,
      fit,
      host,
      pane: 0,
      connected: true,
      nativePty: false,
      pipeMode: false,
      log: '',
    }
    sessions.push(session)
    activeId = id
    bindTermInput(session, id)
    renderTabsRail()

    let meta = opts.attach || null
    if (!meta) {
      try {
        meta = await api().termCreate({
          id,
          cwd: cwdHint || undefined,
          cols,
          rows,
          profile,
          fresh: Boolean(opts.fresh),
        })
      } catch (err) {
        term.writeln(`\x1b[31mTerminal failed to start: ${String(err?.message || err)}\x1b[0m`)
        return null
      }
    }
    if (!meta) {
      term.writeln('\x1b[31mTerminal failed to start.\x1b[0m')
      return null
    }

    if (meta?.id && meta.id !== id) {
      session.id = meta.id
      if (activeId === id) activeId = meta.id
    }
    const sid = session.id

    const shell = meta.shell || profile
    shellProfile = shell
    session.shell = shell
    session.cwd = meta.cwd || cwdHint
    if (session.cwd) void api().termBindCwd?.({ id: sid, cwd: session.cwd })
    session.connected = meta.connected !== false
    session.nativePty = Boolean(meta.pty)
    session.pipeMode = Boolean(meta.pipe) && !session.nativePty
    session._resetLineBuffer?.()
    if (session.cwd) cwdHint = session.cwd

    if (meta.pty) {
      setConnectionWarn(false)
    } else if (meta.pipe) {
      setConnectionWarn(
        true,
        'Compatible terminal mode (no native PTY on this PC). Type commands and press Enter — output stays in this panel, not a separate Windows cmd window. For full PTY: Visual Studio Build Tools + npm run rebuild-native in desktop/.',
      )
    } else {
      setConnectionWarn(true, 'Shell did not start — click + for a new terminal')
    }

    const cached = pendingRestoreLogs.find((row) => row && (row.log || '').length) || pendingRestoreLogs[0]
    const restored = String(meta.previousLog || opts.restoreLog || cached?.log || '')
    if (restored.trim()) {
      session.log = restored.slice(-160000)
      term.write(restored)
      if (!/[\r\n]$/.test(restored)) term.write('\r\n')
      if (!meta.reused) {
        term.writeln('\x1b[90m── previous session (shell restarted) ──\x1b[0m')
        if (session.cwd) term.writeln(`\x1b[90mProject folder: ${session.cwd}\x1b[0m`)
      }
    } else {
      term.writeln('\x1b[90mStarting shell…\x1b[0m')
      if (session.cwd) term.writeln(`\x1b[90mProject folder: ${session.cwd}\x1b[0m`)
    }

    session._flushInput?.()
    flushOutput(id, term)
    if (sid !== id) flushOutput(sid, term)
    showSessionHost(sid)
    syncToolbar()

    if (!cwdHint) {
      term.writeln('\x1b[33mOpen a project folder (File → Open Folder) to start in that directory.\x1b[0m')
    }

    const refit = () => syncResize(session)
    setTimeout(refit, 50)
    setTimeout(refit, 250)
    setTimeout(refit, 600)
    setTimeout(refit, 1200)
    term.focus()
    return session
  }

  function focusSession(id) {
    if (!sessions.some((s) => s.id === id)) return
    showSessionHost(id)
  }

  async function newTerminal() {
    await createSession({ fresh: true })
  }

  function killActive() {
    const s = activeSession()
    if (!s) return
    api().termKill(s.id)
    s.term.dispose()
    s.host.remove()
    sessions = sessions.filter((x) => x.id !== s.id)
    activeId = sessions[sessions.length - 1]?.id || null
    if (sessions.length) showSessionHost(activeId)
    else {
      renderShellLabel()
      renderTabsRail()
    }
    if (!sessions.length && splitMode) toggleSplit(false)
    syncToolbar()
  }

  function killAll() {
    for (const s of sessions) {
      api().termKill(s.id)
      s.term.dispose()
      s.host.remove()
    }
    sessions = []
    activeId = null
    renderShellLabel()
    renderTabsRail()
    if (splitMode) toggleSplit(false)
    syncToolbar()
  }

  function fitAll() {
    syncResize(activeSession())
  }

  async function runAgentCommand(command, opts = {}) {
    const line = String(command || '').trim()
    if (!line) return
    if (opts.cwd) setProjectCwd(opts.cwd)
    await ensureAgentShellReady()
    const active = activeSession()
    if (!active || active.connected === false) return
    await new Promise((r) => setTimeout(r, 150))
    showAgentCommandInTerm(active.term, line)
    await api().termWrite?.({
      id: active.id,
      data: agentShellInputOnly(line, active.shell),
    })
    active.term?.scrollToBottom?.()
  }

  async function ensureAgentShellReady() {
    return ensureReadyInternal()
  }

  async function ensureReadyInternal() {
    watchPanelResize()
    bindIpcOnce()
    const live = sessions.filter((s) => s.connected !== false)
    if (live.length) {
      const focus = live.find((s) => s.id === activeId) || live[live.length - 1]
      if (focus) showSessionHost(focus.id)
      fitAll()
      focusActiveTerm()
    } else if (!sessions.length) {
      let attached = false
      try {
        const liveRows = await api().termListLive?.({ cwd: cwdHint || undefined })
        if (Array.isArray(liveRows) && liveRows.length) {
          attached = true
          for (const row of liveRows) {
            await createSession({ attach: row })
          }
        }
      } catch {
        /* spawn a new shell below */
      }
      if (!attached) await createSession({})
    } else {
      const target = activeSession() || sessions[sessions.length - 1]
      showSessionHost(target.id)
    }
    syncToolbar()
    return activeSession()
  }

  function setProjectCwd(cwd) {
    const next = cwd || null
    if (!next) {
      cwdHint = null
      renderShellLabel()
      return
    }
    if (next === cwdHint) return
    cwdHint = next
    for (const s of sessions) {
      if (normTermPath(s.cwd) === normTermPath(next)) {
        s.cwd = next
        continue
      }
      s.cwd = next
      s._resetLineBuffer?.()
      const cmd = cdCommand(next, s.shell)
      if (cmd) api().termWrite({ id: s.id, data: cmd })
      void api().termBindCwd?.({ id: s.id, cwd: next })
    }
    renderShellLabel()
  }

  function toggleSplit(on) {
    const workspace = $('term-workspace')
    const panes = $('term-panes')
    if (!workspace || !panes) return
    splitMode = on !== undefined ? on : !splitMode
    workspace.classList.toggle('term-split', splitMode)
    if (splitMode && panes.children.length < 2) {
      const pane = document.createElement('div')
      pane.className = 'term-pane'
      pane.dataset.pane = '1'
      pane.innerHTML = '<div class="term-hosts term-hosts-split"></div>'
      panes.appendChild(pane)
    }
    requestAnimationFrame(() => fitAll())
  }

  $('term-shell-label')?.addEventListener('click', (ev) => {
    ev.stopPropagation()
    if (shellMenuOpen) closeShellMenu()
    else openShellMenu()
  })

  $('term-hosts')?.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return
    focusActiveTerm()
  })
  $('view-terminal')?.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return
    if (ev.target.closest('.term-shell-menu')) return
    focusActiveTerm()
  })

  watchPanelResize()

  syncToolbar()

  window.SoumtokTerminal = {
    setProjectCwd,
    newTerminal,
    killActive,
    killAll,
    fitAll,
    toggleSplit,
    syncToolbar,
    focusActive: focusActiveTerm,
    hasSessions: () => sessions.length > 0,
    snapshot: () =>
      sessions.map((s) => ({
        profile: s.shell,
        cwd: s.cwd,
        log: String(s.log || '').slice(-120000),
      })),
    setRestoreLogs: (rows) => {
      pendingRestoreLogs = Array.isArray(rows) ? rows.filter(Boolean) : []
    },
    runAgentCommand,
    appendDisplay,
    ensureReady: async () => ensureReadyInternal(),
    ensureOne: async () => ensureReadyInternal(),
    openTerminal: async () => ensureReadyInternal(),
  }
})()
