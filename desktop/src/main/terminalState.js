/**
 * Structured terminal / dev-server awareness for the agent harness.
 */
const { readLogsForCwd, stripAnsi, normalizeCwd } = require('./terminalLog')

const DEV_READY =
  /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):\d+|running at http|dev server looks READY|Likely URLs:/i

function extractUrls(log) {
  const clean = stripAnsi(log)
  return [...new Set([...clean.matchAll(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):\d+[^\s"'<>]*/gi)].map((m) => m[0]))].slice(
    -6,
  )
}

function getWorkspaceTerminalState(cwd) {
  const log = readLogsForCwd(cwd, 14_000)
  const clean = stripAnsi(log)
  const tail = clean.slice(-2800)
  const urls = extractUrls(log)
  const exited = /\[Process exited\]/i.test(tail)
  const devServerUp = DEV_READY.test(log) && !(exited && !DEV_READY.test(tail.slice(-900)))
  const portInUse = /EADDRINUSE|already in use|address already in use/i.test(tail)
  const compileErr = /error|ERR!|TransformError|Cannot find module/i.test(tail.slice(-1200))
  let status = 'idle'
  if (devServerUp) status = 'dev_server_up'
  else if (portInUse) status = 'port_in_use'
  else if (compileErr) status = 'errors_in_log'
  else if (log.trim().length > 80) status = 'has_output'

  return {
    status,
    devServerUp,
    urls,
    portInUse,
    hasRecentOutput: log.trim().length > 40,
    summary: formatTerminalStateSummary({ status, devServerUp, urls, portInUse, compileErr }),
  }
}

function formatTerminalStateSummary(state) {
  const lines = []
  if (state.devServerUp && state.urls?.length) {
    lines.push(`Dev server UP — use existing session: ${state.urls[state.urls.length - 1]}`)
    lines.push('Do NOT start another npm run dev unless read_terminal shows it died.')
  } else if (state.portInUse) {
    lines.push('Port already in use — server may already be running; read_terminal before starting dev.')
  } else if (state.status === 'errors_in_log') {
    lines.push('Terminal log shows compile/runtime errors — fix before restarting dev server.')
  } else if (state.status === 'has_output') {
    lines.push('Terminal has recent output — read_terminal before running duplicate long commands.')
  } else {
    lines.push('No dev server detected in terminal log yet.')
  }
  return lines.join(' ')
}

function composeTerminalStateBlock(cwd) {
  if (!cwd) return ''
  const s = getWorkspaceTerminalState(cwd)
  const lines = [
    'SOUMTOK TERMINAL STATE (integrated terminal + archived log):',
    `Status: ${s.status}`,
    s.summary,
  ]
  if (s.urls.length) lines.push(`URLs: ${s.urls.join(', ')}`)
  return lines.join('\n')
}

module.exports = {
  getWorkspaceTerminalState,
  composeTerminalStateBlock,
  formatTerminalStateSummary,
}
