/**
 * Per-user storage scope. Extensions, the extension host profile (settings, sign-ins, state) and
 * the host workspace live under a folder keyed to the signed-in account, so one Soumtok user never
 * sees what another installed on the same machine. The account id is hashed: the folder name does
 * not leak an email address.
 */
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const GUEST_KEY = 'local'

let activeKey = GUEST_KEY
let activeLabel = ''
let onChange = null

function soumtokIdeRoot() {
  return path.join(os.homedir(), '.soumtok', 'ide')
}

function userKeyFor(user) {
  const id = String(user?.id || user?.email || '').trim().toLowerCase()
  if (!id) return GUEST_KEY
  return crypto.createHash('sha256').update(id).digest('hex').slice(0, 16)
}

/** Root for everything that belongs to the signed-in user only. */
function userScopeRoot() {
  const root = path.join(soumtokIdeRoot(), 'users', activeKey)
  fs.mkdirSync(root, { recursive: true })
  return root
}

/** Claude Code auth, sessions, and settings — never share the machine-wide ~/.claude. */
function claudeConfigDir() {
  const dir = path.join(userScopeRoot(), 'claude')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function activeUserKey() {
  return activeKey
}

function activeUserLabel() {
  return activeLabel
}

function isSignedInScope() {
  return activeKey !== GUEST_KEY
}

/**
 * The first account to sign in adopts the extensions installed before scoping existed, so the
 * person already using this machine keeps them and later accounts start clean.
 */
function adoptLegacyDeviceStorage() {
  const marker = path.join(soumtokIdeRoot(), '.user-scoped-v1')
  if (fs.existsSync(marker) || !isSignedInScope()) return
  const moves = [
    [path.join(soumtokIdeRoot(), 'extensions'), path.join(userScopeRoot(), 'extensions')],
    [path.join(soumtokIdeRoot(), 'extension-host-workspace'), path.join(userScopeRoot(), 'extension-host-workspace')],
    [
      path.join(os.homedir(), '.soumtok', 'soumtok-code-host', 'user-data'),
      path.join(userScopeRoot(), 'code-host', 'user-data'),
    ],
  ]
  for (const [from, to] of moves) {
    try {
      if (!fs.existsSync(from) || fs.existsSync(to)) continue
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.renameSync(from, to)
    } catch {
      /* leave the old copy in place rather than lose it */
    }
  }
  try {
    fs.mkdirSync(soumtokIdeRoot(), { recursive: true })
    fs.writeFileSync(marker, activeKey, 'utf8')
  } catch {
    /* retried on the next sign-in */
  }
}

/** Called whenever the session is resolved; returns true when the scope actually changed. */
function setActiveUser(user) {
  const key = userKeyFor(user)
  if (key === activeKey) {
    activeLabel = user?.email || user?.name || activeLabel
    return false
  }
  activeKey = key
  activeLabel = user?.email || user?.name || ''
  adoptLegacyDeviceStorage()
  onChange?.(activeKey)
  return true
}

function onUserScopeChange(fn) {
  onChange = typeof fn === 'function' ? fn : null
}

module.exports = {
  soumtokIdeRoot,
  userScopeRoot,
  claudeConfigDir,
  activeUserKey,
  activeUserLabel,
  isSignedInScope,
  setActiveUser,
  onUserScopeChange,
}
